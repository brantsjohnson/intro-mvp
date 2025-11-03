# Messages App Implementation Guide for Loveable

This document contains all the code and instructions needed to implement a working messages/chat system with Supabase.

---

## ⚠️ IMPORTANT: TABLE/COLUMN NAME VARIATIONS

**Before you start:** The code references Supabase tables and columns. If your Supabase setup has different names, you'll need to update:
- Table names (e.g., `messages`, `profiles`, `events`, `message_threads`)
- Column names (e.g., `thread_id`, `sender`, `recipient`, `body`)
- Foreign key relationships

Search this document for `[ADAPT THIS]` markers to find where names might differ.

---

## 1. DATABASE SCHEMA

### Required Tables

#### `messages` Table
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  sender UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE
);
```

**Key Points:**
- `thread_id` is TEXT (not UUID) - format: `eventId_userA_userB` (where userA < userB alphabetically)
- `sender` and `recipient` reference `auth.users(id)`
- `event_id` references `events(id)`

#### `message_threads` Table (Optional but Recommended)
```sql
CREATE TABLE message_threads (
  id TEXT PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  participant_a UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_at TIMESTAMP WITH TIME ZONE
);
```

#### `profiles` Table (Required - for displaying user info)
```sql
-- Your profiles table needs these columns at minimum:
-- id (UUID, references auth.users)
-- first_name (TEXT)
-- last_name (TEXT)
-- avatar_url (TEXT, nullable)
-- job_title (TEXT, nullable)
```

#### `events` Table (Required - messages are scoped to events)
```sql
-- Your events table needs:
-- id (UUID, primary key)
-- name (TEXT)
-- ends_at (TIMESTAMP WITH TIME ZONE)
```

#### `event_members` Table (Required - to know who can message whom)
```sql
-- Your event_members table needs:
-- event_id (UUID, references events)
-- user_id (UUID, references auth.users)
```

---

## 2. DATABASE FUNCTIONS (RPC) - REQUIRED

These functions are called by the MessageService. You MUST create them in Supabase.

### Function 1: `get_or_create_thread`

This function creates a consistent thread ID for a conversation between two users.

```sql
CREATE OR REPLACE FUNCTION get_or_create_thread(
  p_event_id UUID,
  p_user_a UUID,
  p_user_b UUID
)
RETURNS TEXT AS $$
DECLARE
  v_thread_id TEXT;
  v_participant_a UUID;
  v_participant_b UUID;
BEGIN
  -- Normalize participant order (always put smaller UUID first)
  IF p_user_a < p_user_b THEN
    v_participant_a := p_user_a;
    v_participant_b := p_user_b;
  ELSE
    v_participant_a := p_user_b;
    v_participant_b := p_user_a;
  END IF;
  
  -- Create thread ID format: eventId_userA_userB
  v_thread_id := p_event_id::TEXT || '_' || v_participant_a::TEXT || '_' || v_participant_b::TEXT;
  
  -- Create thread record if it doesn't exist
  INSERT INTO message_threads (id, event_id, participant_a, participant_b, created_at, updated_at)
  VALUES (v_thread_id, p_event_id, v_participant_a, v_participant_b, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW();
  
  RETURN v_thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**[ADAPT THIS]:** If you use a different thread ID format, update the `v_thread_id` assignment.

### Function 2: `mark_messages_read`

Marks all messages in a thread as read for a specific user.

```sql
CREATE OR REPLACE FUNCTION mark_messages_read(
  p_thread_id TEXT,
  p_user_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE messages
  SET is_read = TRUE,
      read_at = NOW()
  WHERE thread_id = p_thread_id
    AND recipient = p_user_id
    AND is_read = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Function 3: `get_unread_message_count`

Returns the count of unread messages for a user in an event.

```sql
CREATE OR REPLACE FUNCTION get_unread_message_count(
  p_user_id UUID,
  p_event_id UUID
)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM messages
    WHERE recipient = p_user_id
      AND event_id = p_event_id
      AND is_read = FALSE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 3. ROW LEVEL SECURITY (RLS) POLICIES

Enable RLS and create policies for the `messages` table:

```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages they sent or received
DROP POLICY IF EXISTS "Users can read own messages" ON messages;
CREATE POLICY "Users can read own messages" ON messages 
  FOR SELECT USING (auth.uid() = sender OR auth.uid() = recipient);

-- Users can send messages (only if they are the sender)
DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can send messages" ON messages 
  FOR INSERT WITH CHECK (auth.uid() = sender);

-- Users can update messages they sent or received (for marking as read)
DROP POLICY IF EXISTS "Users can update own messages" ON messages;
CREATE POLICY "Users can update own messages" ON messages 
  FOR UPDATE USING (auth.uid() = sender OR auth.uid() = recipient);
```

---

## 4. DATABASE INDEXES

For performance, create these indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient);
CREATE INDEX IF NOT EXISTS idx_messages_event_id ON messages(event_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_participants ON message_threads(participant_a, participant_b);
```

---

## 5. MESSAGE SERVICE CODE

This is the core service that handles all message operations. Create this file: `src/lib/message-service-simple.ts`

```typescript
import { createClientComponentClient } from './supabase'  // [ADAPT THIS] - your Supabase client import

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
    this.supabase = createClientComponentClient()  // [ADAPT THIS]
  }

  // Get all threads for current user in an event
  async getThreads(eventId: string): Promise<ThreadWithDetails[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Get all messages for this event where user is sender or recipient
    const { data: messages, error } = await this.supabase
      .from('messages')  // [ADAPT THIS] - your messages table name
      .select(`
        *,
        sender_profile:profiles!messages_sender_fkey(  // [ADAPT THIS] - check your foreign key name
          id, first_name, last_name, avatar_url, job_title
        )
      `)
      .eq('event_id', eventId)  // [ADAPT THIS]
      .or(`sender.eq.${user.id},recipient.eq.${user.id}`)  // [ADAPT THIS]
      .order('created_at', { ascending: false })

    if (error) throw error

    // Group messages by thread_id and create thread objects
    const threadMap = new Map<string, ThreadWithDetails>()

    for (const message of messages || []) {
      const threadId = message.thread_id
      
      if (!threadMap.has(threadId)) {
        // Determine the other participant
        const otherUserId = message.sender === user.id ? message.recipient : message.sender
        const otherProfile = message.sender === user.id 
          ? await this.getProfile(otherUserId)
          : message.sender_profile

        threadMap.set(threadId, {
          id: threadId,
          event_id: eventId,
          participant_a: user.id,
          participant_b: otherUserId || '',
          created_at: message.created_at,
          updated_at: message.created_at,
          last_message_at: message.created_at,
          other_participant: otherProfile || { id: '', first_name: 'Unknown', last_name: 'User' },
          last_message: message as MessageWithSender,
          unread_count: 0
        })
      }

      // Update unread count
      const thread = threadMap.get(threadId)!
      if (message.recipient === user.id && !message.is_read) {
        thread.unread_count++
      }
    }

    return Array.from(threadMap.values()).sort((a, b) => 
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
  }

  // Get messages for a specific thread
  async getThreadMessages(threadId: string): Promise<ConversationMessage[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await this.supabase
      .from('messages')  // [ADAPT THIS]
      .select(`
        *,
        sender_profile:profiles!messages_sender_fkey(  // [ADAPT THIS]
          id, first_name, last_name, avatar_url, job_title
        )
      `)
      .eq('thread_id', threadId)  // [ADAPT THIS]
      .order('created_at', { ascending: true })

    if (error) throw error

    return (data || []).map(message => ({
      ...message,
      is_from_current_user: message.sender === user.id
    }))
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
      .rpc('get_or_create_thread', {  // [ADAPT THIS] - your RPC function name
        p_event_id: eventId,  // [ADAPT THIS] - parameter names might differ
        p_user_a: user.id,
        p_user_b: recipientId
      })

    if (threadError) throw threadError

    // Insert message
    const { data, error } = await this.supabase
      .from('messages')  // [ADAPT THIS]
      .insert({
        event_id: eventId,  // [ADAPT THIS]
        thread_id: threadId,  // [ADAPT THIS]
        sender: user.id,  // [ADAPT THIS]
        recipient: recipientId,  // [ADAPT THIS]
        body  // [ADAPT THIS]
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
      .rpc('mark_messages_read', {  // [ADAPT THIS]
        p_thread_id: threadId,  // [ADAPT THIS]
        p_user_id: user.id  // [ADAPT THIS]
      })

    if (error) throw error
  }

  // Get unread message count for current user in an event
  async getUnreadCount(eventId: string): Promise<number> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: count, error } = await this.supabase
      .rpc('get_unread_message_count', {  // [ADAPT THIS]
        p_user_id: user.id,  // [ADAPT THIS]
        p_event_id: eventId  // [ADAPT THIS]
      })

    if (error) throw error
    return count || 0
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
          table: 'messages',  // [ADAPT THIS]
          filter: `event_id=eq.${eventId}`  // [ADAPT THIS]
        },
        callback
      )
      .subscribe()
  }

  // Helper method to get profile
  private async getProfile(userId: string | null): Promise<Profile | null> {
    if (!userId) return null

    const { data } = await this.supabase
      .from('profiles')  // [ADAPT THIS]
      .select('id, first_name, last_name, avatar_url, job_title')  // [ADAPT THIS]
      .eq('id', userId)
      .single()

    return data
  }
}
```

---

## 6. UI COMPONENTS

### Messages List Page (`MessagesPage.tsx`)

Shows all attendees in an event, with unread indicators.

**Key Features:**
- Lists all event members (excluding current user)
- Shows unread message count badges
- Searchable by name
- Clicking an attendee opens conversation

**See file:** `src/components/messages/messages-page.tsx` (provided in codebase)

**Key Dependencies:**
- `MessageService` (above)
- `PresenceAvatar` component (shows user avatar)
- `Card`, `CardContent` UI components
- Next.js router

### Conversation View (`ConversationView.tsx`)

Shows individual conversation between two users.

**Key Features:**
- Real-time message updates
- Optimistic UI (shows sent messages immediately)
- Auto-scroll to bottom
- Mark as read when viewed
- Event-ended handling (disables messaging after event + 1 day)

**See file:** `src/components/messages/conversation-view.tsx` (provided in codebase)

**Key Dependencies:**
- `MessageService` (above)
- `PresenceAvatar` component
- `Input` component for message input
- Real-time subscriptions

---

## 7. ROUTING STRUCTURE

Your app needs these routes:

```
/messages                    → Messages list page (shows all attendees)
/messages/conversation       → Individual conversation view
```

**Query Parameters:**
- `/messages?eventId={eventId}` - Filter messages by event
- `/messages/conversation?eventId={eventId}&threadId={threadId}` - View existing thread
- `/messages/conversation?eventId={eventId}&userId={userId}` - Start new conversation

---

## 8. REAL-TIME SUBSCRIPTIONS

The service uses Supabase real-time subscriptions. Ensure:
1. Real-time is enabled in your Supabase project
2. Replication is enabled for the `messages` table
3. The subscription listens to `postgres_changes` on the `messages` table

**To enable in Supabase Dashboard:**
- Go to Database → Replication
- Enable replication for `messages` table

---

## 9. EVENT-RELATED FUNCTIONALITY

**Important:** Messages are scoped to events. The system:
- Only allows messaging between users in the same event
- Disables messaging 1 day after event ends
- Shows event name in the UI

**Required checks:**
1. Verify user is member of event before allowing messages
2. Check `events.ends_at` to determine if messaging is still allowed
3. Show appropriate UI when event has ended

---

## 10. CHECKLIST FOR IMPLEMENTATION

### Database Setup:
- [ ] Create `messages` table with correct schema
- [ ] Create `message_threads` table (optional)
- [ ] Ensure `profiles` table has required columns
- [ ] Ensure `events` table has `id` and `ends_at`
- [ ] Create RPC functions: `get_or_create_thread`, `mark_messages_read`, `get_unread_message_count`
- [ ] Set up RLS policies for `messages` table
- [ ] Create indexes for performance
- [ ] Enable real-time replication for `messages` table

### Code Setup:
- [ ] Create `MessageService` class
- [ ] Adapt table/column names if different
- [ ] Adapt foreign key relationship names
- [ ] Create messages list page component
- [ ] Create conversation view component
- [ ] Set up routing
- [ ] Test real-time subscriptions
- [ ] Handle event-ended states
- [ ] Test unread count functionality

### Testing:
- [ ] Send message between two users
- [ ] Verify thread creation
- [ ] Check unread counts update correctly
- [ ] Verify real-time updates work
- [ ] Test marking messages as read
- [ ] Verify event-ended messaging is disabled

---

## 11. COMMON ADAPTATIONS

### If your table/column names differ:

1. **Table Names:**
   - Search for `from('messages')` → change to your table name
   - Search for `from('profiles')` → change to your table name

2. **Column Names:**
   - `thread_id` → your thread identifier column
   - `sender` → your sender column
   - `recipient` → your recipient column
   - `event_id` → your event reference column
   - `is_read` → your read status column

3. **Foreign Key Relationships:**
   - `profiles!messages_sender_fkey` → your actual foreign key name
   - Check in Supabase Dashboard → Database → Table Editor → Foreign Keys

4. **RPC Function Names:**
   - `get_or_create_thread` → your function name
   - `mark_messages_read` → your function name
   - `get_unread_message_count` → your function name

5. **Parameter Names:**
   - If your RPC functions use different parameter names, update the `.rpc()` calls accordingly

---

## 12. TROUBLESHOOTING

### Messages not appearing:
- Check RLS policies allow user to read messages
- Verify `thread_id` format matches in both tables
- Check real-time subscriptions are connected

### Real-time not working:
- Ensure replication is enabled for `messages` table
- Check Supabase project has real-time enabled
- Verify subscription is properly set up

### Unread counts wrong:
- Check `get_unread_message_count` function is working
- Verify `is_read` column is being updated
- Check RLS allows reading messages

### Thread creation fails:
- Verify `get_or_create_thread` function exists
- Check function parameters match
- Ensure function has `SECURITY DEFINER` flag

---

## 13. EXAMPLE USAGE

```typescript
// Initialize service
const messageService = new MessageService()

// Get all threads for an event
const threads = await messageService.getThreads(eventId)

// Get messages in a thread
const messages = await messageService.getThreadMessages(threadId)

// Send a message
const newMessage = await messageService.sendMessage(eventId, recipientId, "Hello!")

// Mark thread as read
await messageService.markThreadAsRead(threadId)

// Get unread count
const unreadCount = await messageService.getUnreadCount(eventId)

// Subscribe to real-time updates
const subscription = messageService.subscribeToMessages(eventId, (payload) => {
  console.log('New message:', payload)
})
```

---

## 14. ADDITIONAL NOTES

- **Thread ID Format:** The current implementation uses `eventId_userA_userB` format. You can adapt this.
- **Event Scoping:** All messages must have an `event_id`. This prevents cross-event messaging.
- **Read Receipts:** Messages are marked as read when a thread is opened. This can be customized.
- **Event End Handling:** Messages become read-only 1 day after event ends. This grace period can be adjusted.

---

## Questions?

If table/column names differ, use Supabase Dashboard to:
1. Inspect your actual schema
2. Check foreign key names
3. Verify RPC function names
4. Update the code accordingly

The `[ADAPT THIS]` markers show where changes are most likely needed.

