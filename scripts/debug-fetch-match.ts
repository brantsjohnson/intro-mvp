import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve('.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
  const viewer = process.argv[2]
  const candidate = process.argv[3]

  if (!viewer || !candidate) {
    console.error('Usage: npx tsx scripts/debug-fetch-match.ts <viewerId> <candidateId> [eventId]')
    process.exit(1)
  }

  const eventIdArg = process.argv[4]

  const aId = viewer < candidate ? viewer : candidate
  const bId = viewer < candidate ? candidate : viewer

  const query = supabase
    .from('connections')
    .select('event_id, a_id, b_id, connection_kind, created_at, match_explanation_text, match_score_breakdown_json')
    .eq('connection_kind', 'system_match')
    .eq('a_id', aId)
    .eq('b_id', bId)
    .order('created_at', { ascending: false })
    .limit(5)

  const { data, error } = eventIdArg ? await query.eq('event_id', eventIdArg) : await query

  if (error) {
    console.error('Error fetching matches:', error)
    process.exit(1)
  }

  console.log(JSON.stringify(data, null, 2))
}

main()
