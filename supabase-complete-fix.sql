-- COMPLETE FIX FOR INFINITE RECURSION IN RLS POLICIES
-- This eliminates all recursive policy dependencies

-- 1. Create a SECURITY DEFINER function that bypasses RLS to check membership
create or replace function public.is_member_of_event(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_members em
    where em.event_id = eid and em.user_id = auth.uid()
  );
$$;

-- 2. Drop ALL problematic policies that cause recursion
drop policy if exists "Users can view events they're members of" on public.events;
drop policy if exists "Users can view event members of their events" on public.event_members;
drop policy if exists "Users can view profiles of event attendees" on public.profiles;
drop policy if exists "Users can view profile hobbies of event attendees" on public.profile_hobbies;
drop policy if exists "Users can view profile expertise of event attendees" on public.profile_expertise;

-- 3. Create new non-recursive policies for events
create policy "Events: select active or member"
on public.events for select
using (is_active = true or public.is_member_of_event(id));

-- 4. Create new non-recursive policies for event_members
create policy "Event members: select if same event"
on public.event_members for select
using (public.is_member_of_event(event_members.event_id));

-- 5. Create new non-recursive policies for profiles
create policy "Profiles: select if same event"
on public.profiles for select
using (
  id = auth.uid() or 
  public.is_member_of_event(
    (select event_id from public.event_members where user_id = profiles.id limit 1)
  )
);

-- 6. Create new non-recursive policies for profile_hobbies
create policy "Profile hobbies: select if same event"
on public.profile_hobbies for select
using (
  user_id = auth.uid() or 
  public.is_member_of_event(
    (select event_id from public.event_members where user_id = profile_hobbies.user_id limit 1)
  )
);

-- 7. Create new non-recursive policies for profile_expertise
create policy "Profile expertise: select if same event"
on public.profile_expertise for select
using (
  user_id = auth.uid() or 
  public.is_member_of_event(
    (select event_id from public.event_members where user_id = profile_expertise.user_id limit 1)
  )
);

-- 8. Keep existing insert/update policies (these don't cause recursion)
-- "Users can join events" on event_members (already exists)
-- "Users can update their own presence" on event_members (already exists)
-- "Users can manage their own hobbies" on profile_hobbies (already exists)
-- "Users can manage their own expertise" on profile_expertise (already exists)
-- "Users can update their own profile" on profiles (already exists)
-- "Users can insert their own profile" on profiles (already exists)

-- 9. Verify the fix by testing the query that was failing
-- This should now work without recursion:
-- SELECT * FROM public.events WHERE code = 'TEST1' AND is_active = true;
