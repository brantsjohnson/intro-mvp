-- Create a permanent view for ALL event members with their data
-- This view consolidates all member information for any event for easy AI access

CREATE OR REPLACE VIEW all_events_members AS
SELECT 
    -- Basic Member Info
    p.id as user_id,
    p.first_name,
    p.last_name,
    p.job_title,
    p.company,
    p.what_do_you_do,
    p.location,
    p.mbti,
    p.enneagram,
    p.avatar_url,
    
    -- Networking Goals
    COALESCE(eng.networking_goals, ARRAY[]::text[]) as networking_goals,
    
    -- Hobbies (aggregated array)
    COALESCE(
        array_agg(DISTINCT h.label) FILTER (WHERE h.label IS NOT NULL),
        ARRAY[]::text[]
    ) as hobbies,
    
    -- Expertise Tags (aggregated array)
    COALESCE(
        array_agg(DISTINCT et.label) FILTER (WHERE et.label IS NOT NULL),
        ARRAY[]::text[]
    ) as expertise_tags,
    
    -- Event Info
    e.id as event_id,
    e.name as event_name,
    e.code as event_code,
    e.matchmaking_enabled,
    e.starts_at,
    e.ends_at,
    
    -- Member Status
    em.joined_at,
    em.is_present,
    
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
    ) as match_count,
    
    -- Full Name (computed)
    CONCAT(p.first_name, ' ', p.last_name) as full_name,
    
    -- Job Description (computed)
    CASE 
        WHEN p.job_title IS NOT NULL AND p.company IS NOT NULL 
        THEN CONCAT(p.job_title, ' at ', p.company)
        WHEN p.job_title IS NOT NULL 
        THEN p.job_title
        WHEN p.company IS NOT NULL 
        THEN p.company
        ELSE 'Not specified'
    END as job_description

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
    p.id, p.first_name, p.last_name, p.job_title, p.company, p.what_do_you_do, 
    p.location, p.mbti, p.enneagram, p.avatar_url, eng.networking_goals,
    e.id, e.name, e.code, e.matchmaking_enabled, e.starts_at, e.ends_at, 
    em.joined_at, em.is_present

ORDER BY e.name, p.first_name, p.last_name;

-- Grant permissions for the view
GRANT SELECT ON all_events_members TO authenticated;
GRANT SELECT ON all_events_members TO anon;

-- Example queries to use the view:

-- Get all members from all events
-- SELECT * FROM all_events_members;

-- Get FRESH event members specifically
-- SELECT * FROM all_events_members WHERE event_code = 'FRESH';

-- Get members from events with matchmaking enabled
-- SELECT * FROM all_events_members WHERE matchmaking_enabled = true;

-- Get members with specific hobbies
-- SELECT * FROM all_events_members WHERE 'hiking' = ANY(hobbies);

-- Get members with specific expertise
-- SELECT * FROM all_events_members WHERE 'marketing' = ANY(expertise_tags);

-- Get members by MBTI type
-- SELECT * FROM all_events_members WHERE mbti = 'ENFP';

-- Get members by company
-- SELECT * FROM all_events_members WHERE company ILIKE '%tech%';

-- Get members who are present at events
-- SELECT * FROM all_events_members WHERE is_present = true;

-- Get members without any connections
-- SELECT * FROM all_events_members WHERE has_connections = false;

-- Get members with multiple matches
-- SELECT * FROM all_events_members WHERE match_count > 1;
