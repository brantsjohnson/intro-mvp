-- Safe version of messaging schema enhancements
-- This handles existing objects gracefully

-- Add read status tracking to messages (if columns don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'messages' AND column_name = 'is_read') THEN
        ALTER TABLE public.messages ADD COLUMN is_read boolean default false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'messages' AND column_name = 'read_at') THEN
        ALTER TABLE public.messages ADD COLUMN read_at timestamptz;
    END IF;
END $$;

-- Create message_threads table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.message_threads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events on delete cascade,
  participant_a uuid references public.profiles on delete cascade,
  participant_b uuid references public.profiles on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_message_at timestamptz,
  unique (event_id, participant_a, participant_b)
);

-- Add indexes (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_message_threads_event_participants 
ON public.message_threads (event_id, participant_a, participant_b);

CREATE INDEX IF NOT EXISTS idx_message_threads_updated_at 
ON public.message_threads (updated_at desc);

CREATE INDEX IF NOT EXISTS idx_messages_thread_created 
ON public.messages (thread_id, created_at desc);

CREATE INDEX IF NOT EXISTS idx_messages_unread 
ON public.messages (recipient, is_read) WHERE is_read = false;

-- Enable RLS on message_threads (if not already enabled)
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate them
DROP POLICY IF EXISTS "Users can view threads they participate in" ON public.message_threads;
DROP POLICY IF EXISTS "Users can create threads" ON public.message_threads;
DROP POLICY IF EXISTS "Users can update threads they participate in" ON public.message_threads;

-- Create RLS policies for message_threads
CREATE POLICY "Users can view threads they participate in" ON public.message_threads
  FOR SELECT USING (auth.uid() = participant_a OR auth.uid() = participant_b);

CREATE POLICY "Users can create threads" ON public.message_threads
  FOR INSERT WITH CHECK (auth.uid() = participant_a OR auth.uid() = participant_b);

CREATE POLICY "Users can update threads they participate in" ON public.message_threads
  FOR UPDATE USING (auth.uid() = participant_a OR auth.uid() = participant_b);

-- Drop and recreate functions (if they exist)
DROP FUNCTION IF EXISTS update_thread_last_message();
DROP FUNCTION IF EXISTS get_or_create_thread(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS mark_messages_read(uuid, uuid);
DROP FUNCTION IF EXISTS get_unread_message_count(uuid, uuid);

-- Function to automatically update thread's last_message_at
CREATE OR REPLACE FUNCTION update_thread_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.message_threads 
  SET 
    last_message_at = NEW.created_at,
    updated_at = NEW.created_at
  WHERE id = NEW.thread_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create thread between two users in an event
CREATE OR REPLACE FUNCTION get_or_create_thread(
  p_event_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
RETURNS uuid AS $$
DECLARE
  thread_id uuid;
BEGIN
  -- Try to find existing thread
  SELECT id INTO thread_id
  FROM public.message_threads
  WHERE event_id = p_event_id
    AND ((participant_a = p_user_a AND participant_b = p_user_b)
         OR (participant_a = p_user_b AND participant_b = p_user_a));
  
  -- Create new thread if none exists
  IF thread_id IS NULL THEN
    INSERT INTO public.message_threads (event_id, participant_a, participant_b)
    VALUES (p_event_id, p_user_a, p_user_b)
    RETURNING id INTO thread_id;
  END IF;
  
  RETURN thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark messages as read
CREATE OR REPLACE FUNCTION mark_messages_read(
  p_thread_id uuid,
  p_user_id uuid
)
RETURNS void AS $$
BEGIN
  UPDATE public.messages
  SET is_read = true, read_at = now()
  WHERE thread_id = p_thread_id
    AND recipient = p_user_id
    AND is_read = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread message count for a user in an event
CREATE OR REPLACE FUNCTION get_unread_message_count(
  p_user_id uuid,
  p_event_id uuid
)
RETURNS integer AS $$
BEGIN
  RETURN (
    SELECT count(*)
    FROM public.messages m
    JOIN public.message_threads mt ON m.thread_id = mt.id
    WHERE mt.event_id = p_event_id
      AND m.recipient = p_user_id
      AND m.is_read = false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger (if it exists)
DROP TRIGGER IF EXISTS on_message_insert_update_thread ON public.messages;

-- Trigger to update thread timestamp when message is inserted
CREATE TRIGGER on_message_insert_update_thread
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION update_thread_last_message();
