-- Simple version: Create a permanent TABLE for FRESH event members
-- This creates the table and populates it once (no automatic updates)

-- Step 1: Create the table
CREATE TABLE IF NOT EXISTS fresh_event_members_table (
    -- Basic Member Info
    user_id uuid PRIMARY KEY,
    first_name text NOT NULL,
    last_name text NOT NULL,
    job_title text,
    company text,
    what_do_you_do text,
    location text,
    mbti text,
    enneagram text,
    avatar_url text,
    
    -- Arrays stored as text (simpler approach)
    networking_goals text,
    hobbies text,
    expertise_tags text,
    
    -- Event Info
    event_id uuid NOT NULL,
    event_name text NOT NULL,
    event_code text NOT NULL,
    matchmaking_enabled boolean DEFAULT false,
    
    -- Member Status
    joined_at timestamptz,
    is_present boolean DEFAULT false,
    
    -- Connection Status
    has_connections boolean DEFAULT false,
    
    -- Match Count
    match_count integer DEFAULT 0,
    
    -- Computed Fields
    full_name text,
    job_description text,
    
    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Step 2: Clear any existing data
DELETE FROM fresh_event_members_table;

-- Step 3: Populate the table with current data
INSERT INTO fresh_event_members_table (
    user_id, first_name, last_name, job_title, company, what_do_you_do,
    location, mbti, enneagram, avatar_url, networking_goals, hobbies,
    expertise_tags, event_id, event_name, event_code, matchmaking_enabled,
    joined_at, is_present, has_connections, match_count, full_name, job_description
)
SELECT 
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
    COALESCE(array_to_string(eng.networking_goals, ', '), '') as networking_goals,
    COALESCE(
        array_to_string(
            array_agg(DISTINCT h.label) FILTER (WHERE h.label IS NOT NULL),
            ', '
        ), ''
    ) as hobbies,
    COALESCE(
        array_to_string(
            array_agg(DISTINCT et.label) FILTER (WHERE et.label IS NOT NULL),
            ', '
        ), ''
    ) as expertise_tags,
    e.id as event_id,
    e.name as event_name,
    e.code as event_code,
    e.matchmaking_enabled,
    em.joined_at,
    em.is_present,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM connections c 
            WHERE c.event_id = e.id 
            AND ((c.a = em.user_id) OR (c.b = em.user_id))
        ) THEN true 
        ELSE false 
    END as has_connections,
    (
        SELECT COUNT(*) 
        FROM matches m 
        WHERE m.event_id = e.id 
        AND (m.a = em.user_id OR m.b = em.user_id)
    ) as match_count,
    CONCAT(p.first_name, ' ', p.last_name) as full_name,
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
WHERE e.code = 'FRESH' 
AND e.is_active = true
GROUP BY 
    p.id, p.first_name, p.last_name, p.job_title, p.company, p.what_do_you_do, 
    p.location, p.mbti, p.enneagram, p.avatar_url, eng.networking_goals,
    e.id, e.name, e.code, e.matchmaking_enabled, em.joined_at, em.is_present;

-- Step 4: Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON fresh_event_members_table TO authenticated;
GRANT SELECT ON fresh_event_members_table TO anon;

-- Step 5: Verify the table was created and populated
SELECT 
    'Table created successfully!' as status,
    COUNT(*) as member_count,
    array_agg(full_name) as member_names
FROM fresh_event_members_table;
