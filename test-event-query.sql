-- Test queries to verify the event exists and is accessible
-- Run these AFTER applying the complete fix

-- 1. Check if TEST1 event exists and is active
SELECT id, code, name, is_active, starts_at 
FROM public.events 
WHERE code = 'TEST1';

-- 2. Check if you can see the event (should work after the fix)
SELECT * FROM public.events WHERE code = 'TEST1' AND is_active = true;

-- 3. Check current user
SELECT auth.uid() as current_user_id;

-- 4. Check if you're already a member of TEST1 event
SELECT em.*, e.name as event_name
FROM public.event_members em
JOIN public.events e ON em.event_id = e.id
WHERE e.code = 'TEST1' AND em.user_id = auth.uid();

-- 5. If TEST1 doesn't exist, create it
INSERT INTO public.events (code, name, is_active, starts_at)
VALUES ('TEST1', 'Test Conference', true, now() + interval '1 day')
ON CONFLICT (code) DO NOTHING;

-- 6. Verify the insert worked
SELECT * FROM public.events WHERE code = 'TEST1';
