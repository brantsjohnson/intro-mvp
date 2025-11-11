import { createClientComponentClient } from './supabase'
import { Tables } from './database.types'

type ConversationRow = Tables<'conversations'>

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
  incoming_message_timestamps?: string[]
}

export interface ConversationMessage extends MessageWithSender {
  is_from_current_user: boolean
}

const FALLBACK_PROFILE: Profile = {
  id: '',
  first_name: 'Unknown',
  last_name: 'User',
  avatar_url: null,
  job_title: null
}

export class MessageService {
  private supabase: ReturnType<typeof createClientComponentClient>
  private profileCache = new Map<string, Profile>()

  constructor() {
    this.supabase = createClientComponentClient()
  }

  async getThreads(eventId: string): Promise<ThreadWithDetails[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: conversations, error: convError } = await this.supabase
      .from('conversations')
      .select('conversation_id, event_id, participant_user_ids, created_at')
      .eq('event_id', eventId)
      .contains('participant_user_ids', [user.id])

    if (convError) throw convError
    if (!conversations || conversations.length === 0) {
      return []
    }

    const conversationIds = conversations.map((c) => c.conversation_id)

    const { data: messages, error: messagesError } = await this.supabase
      .from('messages')
      .select('message_id, conversation_id, sender_user_id, message_body, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })

    if (messagesError) throw messagesError

    const threadMap = new Map<string, ThreadWithDetails>()

    for (const conversation of conversations) {
      const otherUserId = conversation.participant_user_ids?.find((id) => id !== user.id)
      if (!otherUserId) continue

      const otherProfile = (await this.getProfile(otherUserId)) ?? FALLBACK_PROFILE

      threadMap.set(conversation.conversation_id, {
        id: conversation.conversation_id,
        event_id: conversation.event_id ?? eventId,
        participant_a: user.id,
        participant_b: otherUserId,
        created_at: conversation.created_at ?? new Date().toISOString(),
        updated_at: conversation.created_at ?? new Date().toISOString(),
        last_message_at: conversation.created_at ?? null,
        other_participant: otherProfile,
        unread_count: 0,
        incoming_message_timestamps: []
      })
    }

    for (const message of messages || []) {
      const thread = threadMap.get(message.conversation_id)
      if (!thread) continue

      const senderProfile = (await this.getProfile(message.sender_user_id)) ?? FALLBACK_PROFILE
      const recipientId = thread.participant_a === message.sender_user_id
        ? thread.participant_b
        : thread.participant_a

      const formatted: MessageWithSender = {
        id: message.message_id,
        event_id: thread.event_id,
        thread_id: thread.id,
        sender: message.sender_user_id,
        recipient: recipientId,
        body: message.message_body,
        created_at: message.created_at ?? new Date().toISOString(),
        is_read: false,
        read_at: null,
        sender_profile: senderProfile
      }

      if (!thread.last_message) {
        thread.last_message = formatted
        thread.last_message_at = formatted.created_at
        thread.updated_at = formatted.created_at
      }

      if (message.sender_user_id !== user.id) {
        thread.unread_count += 1
        thread.incoming_message_timestamps?.push(
          message.created_at ?? new Date().toISOString()
        )
      }
    }

    return Array.from(threadMap.values()).sort((a, b) => {
      const aTime = a.last_message_at ?? a.updated_at
      const bTime = b.last_message_at ?? b.updated_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })
  }

  async getThreadMessages(threadId: string): Promise<ConversationMessage[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: conversation } = await this.supabase
      .from('conversations')
      .select('conversation_id, event_id, participant_user_ids')
      .eq('conversation_id', threadId)
      .maybeSingle()

    const participants = conversation?.participant_user_ids ?? []

    const { data, error } = await this.supabase
      .from('messages')
      .select('message_id, conversation_id, sender_user_id, message_body, created_at')
      .eq('conversation_id', threadId)
      .order('created_at', { ascending: true })

    if (error) throw error

    const messagesWithProfiles = await Promise.all(
      (data || []).map(async (message) => {
        const senderProfile = (await this.getProfile(message.sender_user_id)) ?? FALLBACK_PROFILE
        const recipientId = participants.find((id) => id !== message.sender_user_id) ?? null

        return {
          id: message.message_id,
          event_id: conversation?.event_id ?? '',
          thread_id: message.conversation_id,
          sender: message.sender_user_id,
          recipient: recipientId,
          body: message.message_body,
          created_at: message.created_at ?? new Date().toISOString(),
          is_read: false,
          read_at: null,
          sender_profile: senderProfile,
          is_from_current_user: message.sender_user_id === user.id
        }
      })
    )

    return messagesWithProfiles
  }

  async getMessageById(messageId: string): Promise<ConversationMessage | null> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await this.supabase
      .from('messages')
      .select(
        'message_id, conversation_id, sender_user_id, message_body, created_at, conversation:conversations(event_id, participant_user_ids)'
      )
      .eq('message_id', messageId)
      .maybeSingle()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw error
    }

    if (!data) {
      return null
    }

    const senderProfile = (await this.getProfile(data.sender_user_id)) ?? FALLBACK_PROFILE
    const conversation = data.conversation
    const participants = conversation?.participant_user_ids ?? []
    const recipientId = participants.find((id) => id !== data.sender_user_id) ?? null

    return {
      id: data.message_id,
      event_id: conversation?.event_id ?? '',
      thread_id: data.conversation_id,
      sender: data.sender_user_id,
      recipient: recipientId,
      body: data.message_body,
      created_at: data.created_at ?? new Date().toISOString(),
      is_read: false,
      read_at: null,
      sender_profile: senderProfile,
      is_from_current_user: data.sender_user_id === user.id
    }
  }

  async sendMessage(eventId: string, recipientId: string, body: string): Promise<Message> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const conversation = await this.getOrCreateConversation(eventId, user.id, recipientId)

    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        conversation_id: conversation.conversation_id,
        sender_user_id: user.id,
        message_body: body
      })
      .select('message_id, conversation_id, sender_user_id, message_body, created_at')
      .single()

    if (error) throw error

    const recipient = conversation.participant_user_ids?.find((id) => id !== user.id) ?? null

    return {
      id: data.message_id,
      event_id: conversation.event_id ?? eventId,
      thread_id: data.conversation_id,
      sender: data.sender_user_id,
      recipient,
      body: data.message_body,
      created_at: data.created_at ?? new Date().toISOString(),
      is_read: false,
      read_at: null
    }
  }

  async markThreadAsRead(_threadId: string): Promise<void> {
    // Read receipts not yet supported with new schema
    return
  }

  async getUnreadCount(eventId: string): Promise<number> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) {
      return 0
    }

    try {
      const threads = await this.getThreads(eventId)

      if (typeof window === 'undefined') {
        return threads.reduce((total, thread) => total + thread.unread_count, 0)
      }

      return threads.reduce((total, thread) => {
        const latestTimestamp = thread.last_message?.created_at ?? thread.updated_at ?? null
        if (!latestTimestamp) return total

        const lastSeen = window.localStorage.getItem(`conversation:lastSeen:${thread.id}`)
        if (!lastSeen) {
          return total + 1
        }

        const lastSeenDate = new Date(lastSeen)
        const latestDate = new Date(latestTimestamp)
        return latestDate > lastSeenDate ? total + 1 : total
      }, 0)
    } catch (error) {
      console.error('Error in getUnreadCount:', error)
      return 0
    }
  }

  async searchEventUsers(eventId: string, query: string): Promise<Profile[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: attendanceData } = await this.supabase
      .from('attendance')
      .select('user_id')
      .eq('event_id', eventId)

    if (!attendanceData || attendanceData.length === 0) return []

    const memberIds = attendanceData.map((a) => a.user_id)

    const { data, error } = await this.supabase
      .from('users')
      .select('user_id, first_name, last_name, photo_url, career_title')
      .in('user_id', memberIds)
      .neq('user_id', user.id)
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
      .limit(10)

    if (error) throw error

    return (data || []).map((u) => ({
      id: u.user_id,
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      avatar_url: u.photo_url || null,
      job_title: u.career_title || null
    }))
  }

  subscribeToMessages(eventId: string, callback: (payload: any) => void) {
    // Realtime filters cannot target event_id directly in messages table (no column).
    // For now, subscribe to all message changes and let callers filter if needed.
    return this.supabase
      .channel(`messages-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        callback
      )
      .subscribe()
  }

  subscribeToThreads(eventId: string, callback: (payload: any) => void) {
    return this.subscribeToMessages(eventId, callback)
  }

  subscribeToConversationMessages(conversationId: string, callback: (payload: any) => void) {
    return this.supabase
      .channel(`conversation-messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        callback
      )
      .subscribe()
  }

  private async getProfile(userId: string | null): Promise<Profile | null> {
    if (!userId) return null

    const cached = this.profileCache.get(userId)
    if (cached) return cached

    const { data } = await this.supabase
      .from('users')
      .select('user_id, first_name, last_name, photo_url, career_title')
      .eq('user_id', userId)
      .single()

    if (!data) return null

    const profile: Profile = {
      id: data.user_id,
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      avatar_url: data.photo_url || null,
      job_title: data.career_title || null
    }

    this.profileCache.set(userId, profile)
    return profile
  }

  private async getOrCreateConversation(eventId: string, userA: string, userB: string): Promise<ConversationRow> {
    const participants = [userA, userB].sort()

    const { data: existing, error } = await this.supabase
      .from('conversations')
      .select('conversation_id, event_id, participant_user_ids, created_at')
      .eq('event_id', eventId)
      .contains('participant_user_ids', participants)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    if (existing) {
      return existing
    }

    const { data, error: insertError } = await this.supabase
      .from('conversations')
      .insert({
        event_id: eventId,
        participant_user_ids: participants,
        created_by_user_id: userA
      })
      .select('conversation_id, event_id, participant_user_ids, created_at')
      .single()

    if (insertError) {
      throw insertError
    }

    return data
  }
}
