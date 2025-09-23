-- FRESH Event Member Data for AI Matching
-- This query gets all the data the AI needs for the FRESH event specifically

SELECT 
    -- Basic Info
    p.id as user_id,
    p.first_name,
    p.last_name,
    p.job_title,
    p.company,
    p.what_do_you_do,
    p.location,
    p.mbti,
    p.enneagram,
    
    -- Networking Goals
    COALESCE(eng.networking_goals, ARRAY[]::text[]) as networking_goals,
    
    -- Hobbies
    COALESCE(
        array_agg(DISTINCT h.label) FILTER (WHERE h.label IS NOT NULL),
        ARRAY[]::text[]
    ) as hobbies,
    
    -- Expertise
    COALESCE(
        array_agg(DISTINCT et.label) FILTER (WHERE et.label IS NOT NULL),
        ARRAY[]::text[]
    ) as expertise_tags,
    
    -- Event Info
    e.id as event_id,
    e.name as event_name,
    e.code as event_code,
    em.joined_at,
    em.is_present

FROM events e
INNER JOIN event_members em ON e.id = em.event_id
INNER JOIN profiles p ON em.user_id = p.id
LEFT JOIN event_networking_goals eng ON e.id = eng.event_id AND em.user_id = eng.user_id
LEFT JOIN profile_hobbies ph ON em.user_id = ph.user_id
LEFT JOIN hobbies h ON ph.hobby_id = h.id
LEFT JOIN profile_expertise pe ON em.user_id = pe.user_id
LEFT JOIN expertise_tags et ON pe.tag_id = et.id

WHERE e.code = 'FRESH' 
AND e.is_active = true

GROUP BY 
    p.id, p.first_name, p.last_name, p.job_title, p.company, p.what_do_you_do, 
    p.location, p.mbti, p.enneagram, eng.networking_goals,
    e.id, e.name, e.code, em.joined_at, em.is_present

ORDER BY p.first_name, p.last_name;
