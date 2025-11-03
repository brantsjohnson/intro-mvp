import { createClientComponentClient } from './supabase'

export interface Message {
  id: string
  event_id: string
  thread_id: string
  sender: string | null
  recipient: string | null
  body: string
  created_at: string
  is_read?: boolean
  read_at?: string | null
}

export interface MessageThread {
  id: string
  event_id: string
  participant_a: string
  participant_b: string
  created_at: string
  updated_at: string
  last_message_at: string | null
}

export interface Profile {
  id: string
  first_name: string
  last_name: string
  avatar_url?: string | null
  job_title?: string | null
}

export interface MessageWithSender extends Message {
  sender_profile: Profile
}

export interface ThreadWithDetails extends MessageThread {
  other_participant: Profile
  last_message?: MessageWithSender
  unread_count: number
}

export interface ConversationMessage extends MessageWithSender {
  is_from_current_user: boolean
}

export class MessageService {
  private supabase: ReturnType<typeof createClientComponentClient>

  constructor() {
    this.supabase = createClientComponentClient()
  }

  // Get all threads for current user in an event
  // NOTE: This method uses old schema (thread_id, sender, recipient) 
  // and may need updating to use conversations/messages properly
  async getThreads(eventId: string): Promise<ThreadWithDetails[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // For now, we'll use a simpler approach: get conversations first, then messages
    const { data: conversations, error: convError } = await this.supabase
      .from('conversations')
      .select('conversation_id, participant_user_ids, created_at')
      .eq('event_id', eventId)
      .contains('participant_user_ids', [user.id])
    
    if (convError || !conversations || conversations.length === 0) {
      return []
    }
    
    const conversationIds = conversations.map(c => c.conversation_id)
    
    const { data: messages, error: messagesError } = await this.supabase
      .from('messages')
      .select('*')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })

    if (messagesError) throw messagesError

    // Group messages by conversation_id and create thread objects
    const threadMap = new Map<string, ThreadWithDetails>()

    for (const message of messages || []) {
      const conversationId = message.conversation_id || message.thread_id // fallback for old schema
      const conversation = conversations.find(c => c.conversation_id === conversationId)
      
      if (!conversation) continue
      
      if (!threadMap.has(conversationId)) {
        // Find other participant
        const otherUserId = conversation.participant_user_ids.find((id: string) => id !== user.id) || ''
        const otherProfile = await this.getProfile(otherUserId)

        // Get last message with sender profile
        const senderProfile = await this.getProfile(message.sender_user_id || message.sender)

        threadMap.set(conversationId, {
          id: conversationId,
          event_id: eventId,
          participant_a: user.id,
          participant_b: otherUserId,
          created_at: conversation.created_at || message.created_at,
          updated_at: message.created_at,
          last_message_at: message.created_at,
          other_participant: otherProfile || { id: '', first_name: 'Unknown', last_name: 'User' },
          last_message: { ...message, sender_profile: senderProfile || { id: '', first_name: '', last_name: '' } } as MessageWithSender,
          unread_count: 0
        })
      }

      // Update unread count (simplified - no is_read flag in new schema)
      const thread = threadMap.get(conversationId)!
      if (message.sender_user_id !== user.id && message.sender !== user.id) {
        thread.unread_count++
      }
    }

    return Array.from(threadMap.values()).sort((a, b) => 
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
  }

  // Get messages for a specific thread/conversation
  async getThreadMessages(threadId: string): Promise<ConversationMessage[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Try conversation_id first (new schema), fallback to thread_id (old schema)
    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .or(`conversation_id.eq.${threadId},thread_id.eq.${threadId}`)
      .order('created_at', { ascending: true })

    if (error) throw error

    // Load sender profiles for each message
    const messagesWithProfiles = await Promise.all(
      (data || []).map(async (message) => {
        const senderId = message.sender_user_id || message.sender
        const senderProfile = await this.getProfile(senderId)
        return {
          ...message,
          sender_profile: senderProfile || { id: '', first_name: 'Unknown', last_name: 'User', avatar_url: null },
          is_from_current_user: senderId === user.id
        }
      })
    )

    return messagesWithProfiles
  }

  // Send a message
  async sendMessage(
    eventId: string,
    recipientId: string,
    body: string
  ): Promise<Message> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Get or create thread using the database function
    const { data: threadId, error: threadError } = await this.supabase
      .rpc('get_or_create_thread', {
        p_event_id: eventId,
        p_user_a: user.id,
        p_user_b: recipientId
      })

    if (threadError) throw threadError

    // Insert message
    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        event_id: eventId,
        thread_id: threadId,
        sender: user.id,
        recipient: recipientId,
        body
      })
      .select()
      .single()

    if (error) throw error

    return data
  }

  // Mark messages as read
  async markThreadAsRead(threadId: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await this.supabase
      .rpc('mark_messages_read', {
        p_thread_id: threadId,
        p_user_id: user.id
      })

    if (error) throw error
  }

  // Get unread message count for current user in an event
  async getUnreadCount(eventId: string): Promise<number> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) {
      // Silently return 0 if not authenticated (prevents error spam)
      return 0
    }

    try {
      // Get all conversations for this event where user is a participant
      const { data: conversations, error: convError } = await this.supabase
        .from('conversations')
        .select('conversation_id')
        .eq('event_id', eventId)
        .contains('participant_user_ids', [user.id])

      if (convError || !conversations || conversations.length === 0) {
        return 0
      }

      const conversationIds = conversations.map(c => c.conversation_id)

      // Count unread messages (messages not from current user, using simple heuristic)
      // Since messages table doesn't have is_read flag in new schema, 
      // we'll use a simple approach: count recent messages not from user
      const { count, error } = await this.supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .in('conversation_id', conversationIds)
        .neq('sender_user_id', user.id)
        // Only count messages from last 7 days to approximate "unread"
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

      if (error) {
        console.error('Error getting unread count:', error)
        return 0
      }

      return count || 0
    } catch (error) {
      console.error('Error in getUnreadCount:', error)
      return 0
    }
  }

  // Search for users in an event to start new conversations
  async searchEventUsers(eventId: string, query: string): Promise<Profile[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // First get event member IDs from attendance table
    const { data: attendanceData } = await this.supabase
      .from('attendance')
      .select('user_id')
      .eq('event_id', eventId)

    if (!attendanceData) return []

    const memberIds = attendanceData.map(a => a.user_id)

    const { data, error } = await this.supabase
      .from('users')
      .select('user_id, first_name, last_name, photo_url, career_title')
      .in('user_id', memberIds)
      .neq('user_id', user.id)
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
      .limit(10)

    if (error) throw error
    
    // Map to Profile format
    return (data || []).map(u => ({
      id: u.user_id,
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      avatar_url: u.photo_url || null,
      job_title: u.career_title || null
    }))
  }

  // Subscribe to real-time message updates
  subscribeToMessages(eventId: string, callback: (payload: any) => void) {
    return this.supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `event_id=eq.${eventId}`
        },
        callback
      )
      .subscribe()
  }

  // Subscribe to thread updates (using messages table for now)
  subscribeToThreads(eventId: string, callback: (payload: any) => void) {
    return this.subscribeToMessages(eventId, callback)
  }

  // Helper method to get profile
  private async getProfile(userId: string | null): Promise<Profile | null> {
    if (!userId) return null

    const { data } = await this.supabase
      .from('users')
      .select('user_id, first_name, last_name, photo_url, career_title')
      .eq('user_id', userId)
      .single()

    if (!data) return null

    // Map to Profile format
    return {
      id: data.user_id,
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      avatar_url: data.photo_url || null,
      job_title: data.career_title || null
    }
  }
}
