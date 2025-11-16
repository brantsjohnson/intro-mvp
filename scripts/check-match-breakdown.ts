#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve('.env.local') })
config({ path: resolve('.env.deploy') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DEPLOY_SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(url, key)

async function main() {
  const eventId = process.argv[2] || '3d902d6c-8479-4712-9989-866ed322e292'
  const userId = process.argv[3] || '81242b4e-53f0-0570-c049-93556b40bfcc'
  
  const { data, error } = await supabase
    .from('connections')
    .select('match_score_breakdown_json, match_score, created_at')
    .eq('event_id', eventId)
    .eq('connection_kind', 'system_match')
    .or(`a_id.eq.${userId},b_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) {
    console.error('Error:', error)
    process.exit(1)
  }

  console.log(`Found ${data?.length || 0} recent matches\n`)
  
  data?.forEach((conn, i) => {
    const breakdown = conn.match_score_breakdown_json as any
    console.log(`Match ${i + 1}:`)
    console.log(`  Score: ${conn.match_score}`)
    console.log(`  Created: ${conn.created_at}`)
    if (breakdown) {
      console.log(`  WantFit: ${breakdown.wantFit?.toFixed(3)}`)
      console.log(`  MutualValue: ${breakdown.mutualValue?.toFixed(3)}`)
      console.log(`  RelationshipFit: ${breakdown.relationshipFit?.toFixed(3)}`)
      console.log(`  TotalScore: ${breakdown.totalScore?.toFixed(3)}`)
      if (breakdown.wantFitComponents) {
        const wfc = breakdown.wantFitComponents
        console.log(`  PersonaBoost: ${wfc.personaBoost?.toFixed(3) || 'N/A'}`)
        console.log(`  PersonaBases: ${wfc.personaBases?.join(', ') || 'N/A'}`)
        if (wfc.viewerRole) {
          console.log(`  ViewerRole: ${wfc.viewerRole.role_function}/${wfc.viewerRole.role_seniority}`)
        }
        if (wfc.candidateRole) {
          console.log(`  CandidateRole: ${wfc.candidateRole.role_function}/${wfc.candidateRole.role_seniority}`)
        }
        if (wfc.viewerPersona) {
          console.log(`  ViewerPersona: sector=${wfc.viewerPersona.sector}, leader_required=${wfc.viewerPersona.leader_required}`)
          console.log(`    BuyerFunctions: ${wfc.viewerPersona.buyer_functions?.join(', ')}`)
        }
      }
      console.log(`  Algorithm: ${breakdown.selection_rule_version || breakdown.match_algorithm_version || 'unknown'}`)
    }
    console.log('')
  })
}

main()
