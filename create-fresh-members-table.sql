-- Create a permanent TABLE for FRESH event members with all their data
-- This table will store consolidated member information for easy AI access

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
    
    -- Networking Goals (as JSON array)
    networking_goals jsonb DEFAULT '[]'::jsonb,
    
    -- Hobbies (as JSON array)
    hobbies jsonb DEFAULT '[]'::jsonb,
    
    -- Expertise Tags (as JSON array)
    expertise_tags jsonb DEFAULT '[]'::jsonb,
    
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
    full_name text GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    job_description text GENERATED ALWAYS AS (
        CASE 
            WHEN job_title IS NOT NULL AND company IS NOT NULL 
            THEN job_title || ' at ' || company
            WHEN job_title IS NOT NULL 
            THEN job_title
            WHEN company IS NOT NULL 
            THEN company
            ELSE 'Not specified'
        END
    ) STORED,
    
    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_fresh_members_event_id ON fresh_event_members_table(event_id);
CREATE INDEX IF NOT EXISTS idx_fresh_members_is_present ON fresh_event_members_table(is_present);
CREATE INDEX IF NOT EXISTS idx_fresh_members_has_connections ON fresh_event_members_table(has_connections);
CREATE INDEX IF NOT EXISTS idx_fresh_members_match_count ON fresh_event_members_table(match_count);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON fresh_event_members_table TO authenticated;
GRANT SELECT ON fresh_event_members_table TO anon;

-- Create a function to populate the table
CREATE OR REPLACE FUNCTION populate_fresh_members_table()
RETURNS void AS $$
BEGIN
    -- Clear existing data
    DELETE FROM fresh_event_members_table;
    
    -- Insert fresh data
    INSERT INTO fresh_event_members_table (
        user_id, first_name, last_name, job_title, company, what_do_you_do,
        location, mbti, enneagram, avatar_url, networking_goals, hobbies,
        expertise_tags, event_id, event_name, event_code, matchmaking_enabled,
        joined_at, is_present, has_connections, match_count
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
        COALESCE(eng.networking_goals, ARRAY[]::text[])::jsonb as networking_goals,
        COALESCE(
            array_agg(DISTINCT h.label) FILTER (WHERE h.label IS NOT NULL),
            ARRAY[]::text[]
        )::jsonb as hobbies,
        COALESCE(
            array_agg(DISTINCT et.label) FILTER (WHERE et.label IS NOT NULL),
            ARRAY[]::text[]
        )::jsonb as expertise_tags,
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
        ) as match_count
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
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically update the table when underlying data changes
CREATE OR REPLACE FUNCTION refresh_fresh_members_table()
RETURNS trigger AS $$
BEGIN
    -- Refresh the table data
    PERFORM populate_fresh_members_table();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers on relevant tables
DROP TRIGGER IF EXISTS trigger_refresh_fresh_members ON event_members;
CREATE TRIGGER trigger_refresh_fresh_members
    AFTER INSERT OR UPDATE OR DELETE ON event_members
    FOR EACH STATEMENT
    EXECUTE FUNCTION refresh_fresh_members_table();

DROP TRIGGER IF EXISTS trigger_refresh_fresh_members_profiles ON profiles;
CREATE TRIGGER trigger_refresh_fresh_members_profiles
    AFTER UPDATE ON profiles
    FOR EACH STATEMENT
    EXECUTE FUNCTION refresh_fresh_members_table();

DROP TRIGGER IF EXISTS trigger_refresh_fresh_members_connections ON connections;
CREATE TRIGGER trigger_refresh_fresh_members_connections
    AFTER INSERT OR UPDATE OR DELETE ON connections
    FOR EACH STATEMENT
    EXECUTE FUNCTION refresh_fresh_members_table();

DROP TRIGGER IF EXISTS trigger_refresh_fresh_members_matches ON matches;
CREATE TRIGGER trigger_refresh_fresh_members_matches
    AFTER INSERT OR UPDATE OR DELETE ON matches
    FOR EACH STATEMENT
    EXECUTE FUNCTION refresh_fresh_members_table();

-- Populate the table initially
SELECT populate_fresh_members_table();

-- Verify the table was created and populated
SELECT COUNT(*) as member_count FROM fresh_event_members_table;
