#!/bin/bash

# Fix onboarding and profile creation issues
echo "🔧 Fixing onboarding and profile creation issues..."

# Set environment variables
export SUPABASE_URL="https://szrznjvllslymamzecyq.supabase.co"
export SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cnpuanZsbHNseW1hbXplY3lxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODQ5NDE0MywiZXhwIjoyMDc0MDcwMTQzfQ.cTHmwzjKoNYe-VW4_BfQyEIEFMJ1I8A9cUyjuae2RAE"

# Run the trigger fix SQL
echo "1. Fixing profile creation trigger..."
psql "postgresql://postgres.szrznjvllslymamzecyq:${SUPABASE_SERVICE_KEY}@aws-0-us-west-1.pooler.supabase.com:6543/postgres" -f check-and-fix-triggers.sql

# Fix event_members table structure
echo "2. Fixing event_members table structure..."
psql "postgresql://postgres.szrznjvllslymamzecyq:${SUPABASE_SERVICE_KEY}@aws-0-us-west-1.pooler.supabase.com:6543/postgres" -c "
-- Add created_at column if it doesn't exist
ALTER TABLE event_members 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Add updated_at column if it doesn't exist  
ALTER TABLE event_members 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS \$\$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_event_members_updated_at ON event_members;
CREATE TRIGGER update_event_members_updated_at
    BEFORE UPDATE ON event_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

SELECT 'Successfully fixed event_members table structure!' as result;
"

# Verify the fixes
echo "3. Verifying fixes..."
node diagnose-onboarding-issues.js

echo "✅ Onboarding fixes completed!"
