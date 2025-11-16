#!/usr/bin/env tsx

import { config } from "dotenv"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function main() {
  console.log("🔍 Checking industry_tags setup...\n")
  
  // Check if function exists
  console.log("1. Checking if derive_industry_tags function exists...")
  const { data: funcCheck, error: funcError } = await supabase
    .rpc('exec_sql', { 
      sql_query: `
        SELECT EXISTS (
          SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = 'public' AND p.proname = 'derive_industry_tags'
        ) as exists;
      `
    })
    .catch(() => ({ data: null, error: null }))
  
  // Try direct query instead
  const { data: users, error } = await supabase
    .from('users')
    .select('user_id, company_name, company_summary, company_url, industry_tags')
    .not('company_summary', 'is', null)
    .limit(10)
  
  if (error) {
    console.error("❌ Error querying users:", error)
    process.exit(1)
  }
  
  console.log(`\n📊 Found ${users?.length || 0} users with company_summary\n`)
  
  if (users && users.length > 0) {
    console.log("Sample users and their industry_tags:")
    users.forEach((user, i) => {
      console.log(`\n${i + 1}. ${user.company_name || 'N/A'}`)
      console.log(`   Summary: ${user.company_summary?.substring(0, 60)}...`)
      console.log(`   Industry Tags: ${user.industry_tags ? JSON.stringify(user.industry_tags) : 'NULL/EMPTY'}`)
    })
    
    // Test the function directly
    console.log("\n🧪 Testing derive_industry_tags function...")
    const testUser = users[0]
    const { data: testResult, error: testError } = await supabase
      .rpc('derive_industry_tags', {
        p_company_summary: testUser.company_summary,
        p_company_name: testUser.company_name,
        p_company_url: testUser.company_url
      })
    
    if (testError) {
      console.error("❌ Error testing function:", testError)
      console.log("\n⚠️  The function might not exist. Let's check triggers...")
    } else {
      console.log(`✅ Function works! Derived tags: ${JSON.stringify(testResult)}`)
    }
  }
  
  // Check trigger
  console.log("\n2. Checking if trigger exists...")
  const { data: triggerCheck } = await supabase
    .rpc('exec_sql', {
      sql_query: `
        SELECT EXISTS (
          SELECT 1 FROM pg_trigger t
          JOIN pg_class c ON t.tgrelid = c.oid
          JOIN pg_namespace n ON c.relnamespace = n.oid
          WHERE n.nspname = 'public' 
            AND c.relname = 'users'
            AND t.tgname = 'trigger_update_industry_tags'
        ) as exists;
      `
    })
    .catch(() => ({ data: null }))
  
  console.log("\n✅ Check complete!")
  console.log("\n💡 If industry_tags are NULL/EMPTY, try:")
  console.log("   1. Refresh the table view in Supabase")
  console.log("   2. Update a user's company_summary to trigger the function")
  console.log("   3. Run: UPDATE public.users SET company_summary = company_summary WHERE company_summary IS NOT NULL;")
}

main().catch(console.error)

