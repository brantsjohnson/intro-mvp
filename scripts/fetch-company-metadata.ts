#!/usr/bin/env ts-node
/**
 * Script to invoke the fetch-company-metadata Edge Function
 * This enriches users with company_name and company_summary based on their company_url
 * Usage: npx tsx scripts/fetch-company-metadata.ts [supabase-url]
 */

import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Try to load .env.local if it exists
try {
  const envPath = resolve(__dirname, '../.env.local')
  const envFile = readFileSync(envPath, 'utf-8')
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  }
} catch {
  // .env.local doesn't exist, that's okay
}

// Allow URL to be passed as argument or from env
const supabaseUrl = process.argv[2] || process.env.NEXT_PUBLIC_SUPABASE_URL

if (!supabaseUrl) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable or URL argument')
  console.error('Usage: npx tsx scripts/fetch-company-metadata.ts [supabase-url]')
  console.error('Or set NEXT_PUBLIC_SUPABASE_URL in .env.local')
  process.exit(1)
}

async function fetchCompanyMetadata() {
  try {
    console.log('🚀 Invoking fetch-company-metadata Edge Function...\n')

    const functionUrl = `${supabaseUrl}/functions/v1/fetch-company-metadata`
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const result = await response.json()

    if (response.ok) {
      console.log('✅ Success!')
      console.log(`📊 ${result.message}`)
      console.log(`📈 Updated ${result.updated_count} user(s)`)
      if (result.processed !== undefined) {
        console.log(`🔍 Processed ${result.processed} user(s), skipped ${result.skipped || 0}`)
        console.log(`📋 Total users with company_url: ${result.total_users || 'unknown'}`)
      }
      if (result.sample_users && result.sample_users.length > 0) {
        console.log('\n📝 Sample users:')
        result.sample_users.forEach((u: any) => {
          console.log(`  - ${u.user_id}: name="${u.company_name || '(null)'}" (len: ${u.company_name_length}), summary="${u.company_summary || '(null)'}" (len: ${u.company_summary_length})`)
        })
      }
    } else {
      console.error('❌ Error:', result.error || result)
      if (result.details) {
        console.error('Details:', result.details)
      }
      process.exit(1)
    }
  } catch (error: any) {
    console.error('Fatal error:', error.message)
    process.exit(1)
  }
}

fetchCompanyMetadata()

