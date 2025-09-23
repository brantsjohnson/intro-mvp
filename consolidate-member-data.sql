-- Consolidated Member Data View for AI Matching
-- This view combines all member information from multiple tables into one comprehensive dataset

CREATE OR REPLACE VIEW consolidated_member_data AS
SELECT 
    -- Event Information
    e.id as event_id,
    e.name as event_name,
    e.code as event_code,
    e.matchmaking_enabled,
    
    -- Member Information
    em.user_id,
    em.joined_at,
    em.is_present,
    
    -- Profile Information
    p.first_name,
    p.last_name,
    p.job_title,
    p.company,
    p.what_do_you_do,
    p.location,
    p.mbti,
    p.enneagram,
    p.avatar_url,
    
    -- Networking Goals (from event_networking_goals)
    eng.networking_goals,
    
    -- Hobbies (aggregated)
    COALESCE(
        array_agg(DISTINCT h.label) FILTER (WHERE h.label IS NOT NULL),
        ARRAY[]::text[]
    ) as hobbies,
    
    -- Expertise (aggregated)
    COALESCE(
        array_agg(DISTINCT et.label) FILTER (WHERE et.label IS NOT NULL),
        ARRAY[]::text[]
    ) as expertise_tags,
    
    -- Connection Status
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM connections c 
            WHERE c.event_id = e.id 
            AND ((c.a = em.user_id) OR (c.b = em.user_id))
        ) THEN true 
        ELSE false 
    END as has_connections,
    
    -- Match Count
    (
        SELECT COUNT(*) 
        FROM matches m 
        WHERE m.event_id = e.id 
        AND (m.a = em.user_id OR m.b = em.user_id)
    ) as match_count

FROM events e
INNER JOIN event_members em ON e.id = em.event_id
INNER JOIN profiles p ON em.user_id = p.id
LEFT JOIN event_networking_goals eng ON e.id = eng.event_id AND em.user_id = eng.user_id
LEFT JOIN profile_hobbies ph ON em.user_id = ph.user_id
LEFT JOIN hobbies h ON ph.hobby_id = h.id
LEFT JOIN profile_expertise pe ON em.user_id = pe.user_id
LEFT JOIN expertise_tags et ON pe.tag_id = et.id

WHERE e.is_active = true

GROUP BY 
    e.id, e.name, e.code, e.matchmaking_enabled,
    em.user_id, em.joined_at, em.is_present,
    p.first_name, p.last_name, p.job_title, p.company, p.what_do_you_do, 
    p.location, p.mbti, p.enneagram, p.avatar_url,
    eng.networking_goals

ORDER BY e.name, p.first_name, p.last_name;

-- Query to get all FRESH event members with their data
SELECT 
    event_name,
    event_code,
    first_name,
    last_name,
    job_title,
    company,
    what_do_you_do,
    location,
    mbti,
    enneagram,
    networking_goals,
    hobbies,
    expertise_tags,
    is_present,
    has_connections,
    match_count
FROM consolidated_member_data 
WHERE event_code = 'FRESH'
ORDER BY first_name, last_name;

-- Query to get all events and their member counts
SELECT 
    event_name,
    event_code,
    COUNT(*) as member_count,
    COUNT(*) FILTER (WHERE is_present = true) as present_count,
    matchmaking_enabled
FROM consolidated_member_data 
GROUP BY event_name, event_code, matchmaking_enabled
ORDER BY event_name;
