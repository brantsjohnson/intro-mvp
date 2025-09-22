-- Check if user data was saved properly
-- Replace '98509b41-6afb-4d34-aa74-41b2303d6324' with the actual user ID from the console

-- Check profile data
SELECT 
    id,
    first_name,
    last_name,
    email,
    job_title,
    company,
    what_do_you_do,
    linkedin_url,
    mbti,
    enneagram,
    networking_goals,
    created_at
FROM public.profiles 
WHERE id = '98509b41-6afb-4d34-aa74-41b2303d6324';

-- Check hobbies
SELECT 
    ph.user_id,
    h.label as hobby_name
FROM public.profile_hobbies ph
JOIN public.hobbies h ON ph.hobby_id = h.id
WHERE ph.user_id = '98509b41-6afb-4d34-aa74-41b2303d6324';

-- Check expertise tags
SELECT 
    pe.user_id,
    et.label as expertise_name
FROM public.profile_expertise pe
JOIN public.expertise_tags et ON pe.tag_id = et.id
WHERE pe.user_id = '98509b41-6afb-4d34-aa74-41b2303d6324';

-- Check event memberships
SELECT 
    em.user_id,
    e.name as event_name,
    e.code as event_code,
    em.joined_at,
    em.is_present
FROM public.event_members em
JOIN public.events e ON em.event_id = e.id
WHERE em.user_id = '98509b41-6afb-4d34-aa74-41b2303d6324';
