import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    // Use service role for full access
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    console.log('🔍 Debugging Database Tables...')

    // Get all tables in the public schema
    const { data: tables, error: tablesError } = await serviceSupabase
      .from('information_schema.tables')
      .select('table_name, table_type')
      .eq('table_schema', 'public')
      .order('table_name')

    if (tablesError) {
      return NextResponse.json({ error: 'Failed to fetch tables', details: tablesError }, { status: 500 })
    }

    // Get all views in the public schema
    const { data: views, error: viewsError } = await serviceSupabase
      .from('information_schema.views')
      .select('table_name')
      .eq('table_schema', 'public')
      .order('table_name')

    if (viewsError) {
      return NextResponse.json({ error: 'Failed to fetch views', details: viewsError }, { status: 500 })
    }

    // Check specifically for all_events_members
    const { data: allEventsMembers, error: allEventsError } = await serviceSupabase
      .from('information_schema.tables')
      .select('table_name, table_type')
      .eq('table_schema', 'public')
      .ilike('table_name', '%all_events_members%')

    // Also check for any table with "events" and "members" in the name
    const { data: eventsMembersTables, error: eventsMembersError } = await serviceSupabase
      .from('information_schema.tables')
      .select('table_name, table_type')
      .eq('table_schema', 'public')
      .or('table_name.ilike.%events%,table_name.ilike.%members%')

    return NextResponse.json({
      success: true,
      debug: {
        allTables: tables || [],
        allViews: views || [],
        allEventsMembersCheck: allEventsMembers || [],
        eventsMembersTables: eventsMembersTables || [],
        summary: {
          totalTables: tables?.length || 0,
          totalViews: views?.length || 0,
          allEventsMembersExists: (allEventsMembers?.length || 0) > 0,
          eventsRelatedTables: eventsMembersTables?.filter(t => 
            t.table_name.toLowerCase().includes('event') || 
            t.table_name.toLowerCase().includes('member')
          ) || []
        }
      }
    })

  } catch (error) {
    console.error('Debug tables API error:', error)
    return NextResponse.json({ 
      error: 'Failed to debug tables',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
