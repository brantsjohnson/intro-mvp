const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://szrznjvllslymamzecyq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cnpuanZsbHNseW1hbXplY3lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0OTQxNDMsImV4cCI6MjA3NDA3MDE0M30.WQpvus7uonb0a0MYhQ1KZYw5uU4Xuu_ZnHMmXbifzCs'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testFreshData() {
  try {
    console.log('🔍 Testing FRESH event data...')
    
    // First, let's run the consolidated query
    console.log('\n📊 Running consolidated member data query...')
    const { data: consolidatedData, error: consolidatedError } = await supabase
      .rpc('exec_sql', { 
        sql: `
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
            COALESCE(eng.networking_goals, ARRAY[]::text[]) as networking_goals,
            COALESCE(
              array_agg(DISTINCT h.label) FILTER (WHERE h.label IS NOT NULL),
              ARRAY[]::text[]
            ) as hobbies,
            COALESCE(
              array_agg(DISTINCT et.label) FILTER (WHERE et.label IS NOT NULL),
              ARRAY[]::text[]
            ) as expertise_tags,
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
          LEFT JOIN expertise_tags et ON pe.expertise_tag_id = et.id
          WHERE e.code = 'FRESH' 
          AND e.is_active = true
          GROUP BY 
            p.id, p.first_name, p.last_name, p.job_title, p.company, p.what_do_you_do, 
            p.location, p.mbti, p.enneagram, eng.networking_goals,
            e.id, e.name, e.code, em.joined_at, em.is_present
          ORDER BY p.first_name, p.last_name;
        `
      })

    if (consolidatedError) {
      console.error('❌ Consolidated query error:', consolidatedError)
    } else {
      console.log('✅ Consolidated data:', consolidatedData)
    }

    // Let's try a simpler approach - get the data step by step
    console.log('\n🔍 Step 1: Get FRESH event...')
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, name, code, matchmaking_enabled")
      .eq("code", "FRESH")
      .eq("is_active", true)
      .single()

    if (eventError) {
      console.error('❌ Event error:', eventError)
      return
    }
    console.log('✅ Event:', event)

    console.log('\n🔍 Step 2: Get event members...')
    const { data: members, error: membersError } = await supabase
      .from("event_members")
      .select("user_id, joined_at, is_present")
      .eq("event_id", event.id)

    if (membersError) {
      console.error('❌ Members error:', membersError)
      return
    }
    console.log('✅ Members:', members)

    console.log('\n🔍 Step 3: Get profiles for each member...')
    for (const member of members) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", member.user_id)
        .single()

      if (profileError) {
        console.error(`❌ Profile error for ${member.user_id}:`, profileError)
      } else {
        console.log(`✅ Profile for ${member.user_id}:`, {
          name: `${profile.first_name} ${profile.last_name}`,
          job: profile.job_title,
          company: profile.company,
          mbti: profile.mbti,
          enneagram: profile.enneagram
        })
      }
    }

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

testFreshData()
