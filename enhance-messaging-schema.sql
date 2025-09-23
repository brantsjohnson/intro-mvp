-- Enhance messaging schema for full chat functionality

-- Add read status tracking to messages
alter table public.messages add column if not exists is_read boolean default false;
alter table public.messages add column if not exists read_at timestamptz;

-- Create message_threads table for better thread management
create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events on delete cascade,
  participant_a uuid references public.profiles on delete cascade,
  participant_b uuid references public.profiles on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_message_at timestamptz,
  unique (event_id, participant_a, participant_b)
);

-- Add index for better performance
create index if not exists idx_message_threads_event_participants on public.message_threads (event_id, participant_a, participant_b);
create index if not exists idx_message_threads_updated_at on public.message_threads (updated_at desc);
create index if not exists idx_messages_thread_created on public.messages (thread_id, created_at desc);
create index if not exists idx_messages_unread on public.messages (recipient, is_read) where is_read = false;

-- Add RLS policies for message_threads
alter table public.message_threads enable row level security;

create policy "Users can view threads they participate in" on public.message_threads
  for select using (auth.uid() = participant_a or auth.uid() = participant_b);

create policy "Users can create threads" on public.message_threads
  for insert with check (auth.uid() = participant_a or auth.uid() = participant_b);

create policy "Users can update threads they participate in" on public.message_threads
  for update using (auth.uid() = participant_a or auth.uid() = participant_b);

-- Function to automatically update thread's last_message_at
create or replace function update_thread_last_message()
returns trigger as $$
begin
  update public.message_threads 
  set 
    last_message_at = new.created_at,
    updated_at = new.created_at
  where id = new.thread_id;
  
  return new;
end;
$$ language plpgsql;

-- Trigger to update thread timestamp when message is inserted
create trigger on_message_insert_update_thread
  after insert on public.messages
  for each row execute function update_thread_last_message();

-- Function to get or create thread between two users in an event
create or replace function get_or_create_thread(
  p_event_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
returns uuid as $$
declare
  thread_id uuid;
begin
  -- Try to find existing thread
  select id into thread_id
  from public.message_threads
  where event_id = p_event_id
    and ((participant_a = p_user_a and participant_b = p_user_b)
         or (participant_a = p_user_b and participant_b = p_user_a));
  
  -- Create new thread if none exists
  if thread_id is null then
    insert into public.message_threads (event_id, participant_a, participant_b)
    values (p_event_id, p_user_a, p_user_b)
    returning id into thread_id;
  end if;
  
  return thread_id;
end;
$$ language plpgsql security definer;

-- Function to mark messages as read
create or replace function mark_messages_read(
  p_thread_id uuid,
  p_user_id uuid
)
returns void as $$
begin
  update public.messages
  set is_read = true, read_at = now()
  where thread_id = p_thread_id
    and recipient = p_user_id
    and is_read = false;
end;
$$ language plpgsql security definer;

-- Function to get unread message count for a user in an event
create or replace function get_unread_message_count(
  p_user_id uuid,
  p_event_id uuid
)
returns integer as $$
begin
  return (
    select count(*)
    from public.messages m
    join public.message_threads mt on m.thread_id = mt.id
    where mt.event_id = p_event_id
      and m.recipient = p_user_id
      and m.is_read = false
  );
end;
$$ language plpgsql security definer;
