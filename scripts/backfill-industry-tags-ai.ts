#!/usr/bin/env tsx

/**
 * Backfill script to update industry_tags for all users using AI
 * This calls the fetch-company-metadata function which will use AI to extract tags
 */

import { config } from "dotenv"
import { resolve } from "node:path"

// Load environment variables
const envFiles = [".env.deploy", ".env.production.local", ".env.local"]
for (const file of envFiles) {
  try {
    config({ path: resolve(file) })
  } catch {}
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DEPLOY_SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

async function main() {
  console.log("🔄 Triggering fetch-company-metadata to backfill industry tags...")
  console.log("This will process all users with company_summary and extract AI-generated industry tags\n")
  
  const functionUrl = `${SUPABASE_URL}/functions/v1/fetch-company-metadata`
  
  try {
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({}), // Empty body triggers batch processing
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Error: ${response.status} ${response.statusText}`)
      console.error(errorText)
      process.exit(1)
    }
    
    const result = await response.json()
    console.log("✅ Success!")
    console.log(`\n📊 Results:`)
    console.log(`   - Updated: ${result.updated_count || 0} users`)
    console.log(`   - Processed: ${result.processed || 0} users`)
    console.log(`   - Skipped: ${result.skipped || 0} users`)
    console.log(`   - Total: ${result.total_users || 0} users`)
    
    if (result.sample_users && result.sample_users.length > 0) {
      console.log(`\n📝 Sample users:`)
      result.sample_users.forEach((user: any, i: number) => {
        console.log(`   ${i + 1}. ${user.company_name || 'N/A'}`)
        console.log(`      Summary: ${user.company_summary || 'N/A'}`)
      })
    }
    
    console.log("\n💡 Check the users table to see the updated industry_tags!")
    
  } catch (error) {
    console.error("❌ Failed to call function:", error)
    process.exit(1)
  }
}

main().catch(console.error)

