-- Fix RLS policy for events table to allow joining
-- This allows authenticated users to view active events by code for joining purposes

-- Drop the existing restrictive policy
drop policy if exists "Users can view events they're members of" on public.events;

-- Add a new policy that allows viewing active events for joining
create policy "Users can view active events for joining" on public.events
  for select using (is_active = true);

-- Keep the existing policy for viewing events they're members of (for other purposes)
create policy "Users can view events they're members of" on public.events
  for select using (
    exists (
      select 1 from public.event_members
      where event_id = events.id and user_id = auth.uid()
    )
  );
