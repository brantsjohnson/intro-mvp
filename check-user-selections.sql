-- Check what the user actually selected during onboarding
-- This will show the complete picture of user selections

-- 1. Check what expertise tags the user selected
SELECT 
    pe.user_id,
    et.label as expertise_name,
    pe.user_id as profile_user_id
FROM public.profile_expertise pe
JOIN public.expertise_tags et ON pe.tag_id = et.id
WHERE pe.user_id = '98509b41-6afb-4d34-aa74-41b2303d6324';

-- 2. Check what hobbies the user selected
SELECT 
    ph.user_id,
    h.label as hobby_name
FROM public.profile_hobbies ph
JOIN public.hobbies h ON ph.hobby_id = h.id
WHERE ph.user_id = '98509b41-6afb-4d34-aa74-41b2303d6324';

-- 3. Check the complete profile data
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

-- 4. Check all available expertise tags (for reference)
SELECT id, label FROM public.expertise_tags ORDER BY id;
