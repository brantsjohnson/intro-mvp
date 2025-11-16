#!/usr/bin/env tsx

import { config } from "dotenv"
import { readFileSync } from "node:fs"
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
  console.error("Set them in .env.deploy or environment variables")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function main() {
  console.log("📝 Reading migration file...")
  const migrationPath = resolve("supabase/migrations/20250101_derive_industry_tags.sql")
  const sql = readFileSync(migrationPath, "utf-8")
  
  // Split SQL into individual statements (split by semicolon + newline, but preserve function bodies)
  const statements = sql
    .split(/;\s*\n\s*--/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("--"))
  
  console.log(`📦 Executing ${statements.length} SQL statements...`)
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + (statements[i].endsWith(";") ? "" : ";")
    try {
      console.log(`  [${i + 1}/${statements.length}] Executing statement...`)
      const { error } = await supabase.rpc("exec_sql", { sql_query: statement })
      
      if (error) {
        // Try direct query if RPC doesn't work
        const { error: queryError } = await supabase
          .from("_migrations")
          .select("1")
          .limit(0)
        
        if (queryError) {
          // Use raw SQL execution via REST API
          const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({ sql_query: statement })
          })
          
          if (!response.ok) {
            console.error(`❌ Failed to execute statement ${i + 1}`)
            console.error(`   Error: ${response.statusText}`)
            // Continue with next statement
            continue
          }
        }
      }
    } catch (err) {
      console.error(`❌ Error executing statement ${i + 1}:`, err)
      // Continue with next statement
    }
  }
  
  // Actually, let's use a simpler approach - execute the whole SQL as one query
  console.log("\n🔄 Executing migration as single query...")
  try {
    // Use the PostgREST approach - we need to execute via SQL directly
    // Since Supabase doesn't expose direct SQL execution, we'll use psql or create a function
    
    // Alternative: Execute via Supabase Management API or use psql
    console.log("⚠️  Direct SQL execution not available via Supabase JS client")
    console.log("📋 Please run this SQL manually in Supabase SQL Editor:")
    console.log("\n" + "=".repeat(60))
    console.log(sql)
    console.log("=".repeat(60))
    console.log("\nOr use psql:")
    console.log(`psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" -f ${migrationPath}`)
  } catch (err) {
    console.error("❌ Error:", err)
    process.exit(1)
  }
}

main().catch(console.error)

