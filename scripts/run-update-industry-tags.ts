#!/usr/bin/env tsx

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
  console.log("🔄 Calling update-industry-tags function...")
  console.log("This will extract AI-generated industry tags for all users with company_summary\n")
  
  const functionUrl = `${SUPABASE_URL}/functions/v1/update-industry-tags`
  
  try {
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ force: true }), // Force update even if tags exist
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
    console.log(`   - Success: ${result.success || 0} users`)
    console.log(`   - Errors: ${result.errors || 0} users`)
    console.log(`   - Total: ${result.total_users || 0} users`)
    
    console.log("\n💡 Check the users table to see the updated industry_tags!")
    
  } catch (error) {
    console.error("❌ Failed to call function:", error)
    process.exit(1)
  }
}

main().catch(console.error)

