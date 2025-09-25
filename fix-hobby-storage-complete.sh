#!/bin/bash

# Complete fix for hobby storage system
# This script applies all necessary database changes to fix the hobby storage issue

echo "🔧 Fixing hobby storage system..."
echo ""
echo "This script will:"
echo "1. Add hobbies and expertise_tags fields to profiles table"
echo "2. Fix the database trigger to remove non-existent field references"
echo "3. Update the all_events_members view to work with the new schema"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set."
    echo ""
    echo "Please set your database URL first:"
    echo "export DATABASE_URL='postgresql://user:password@host:port/database'"
    echo ""
    echo "Or if using Supabase:"
    echo "export DATABASE_URL='postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres'"
    echo ""
    exit 1
fi

echo "✅ DATABASE_URL is set"
echo ""

# Step 1: Add hobbies and expertise_tags fields to profiles table
echo "🚀 Step 1: Adding hobbies and expertise_tags fields to profiles table..."
psql "$DATABASE_URL" -f add-hobbies-field-to-profiles.sql

if [ $? -eq 0 ]; then
    echo "✅ Successfully added hobbies and expertise_tags fields to profiles table"
else
    echo "❌ Failed to add fields to profiles table"
    exit 1
fi

# Step 2: Fix the database trigger
echo ""
echo "🚀 Step 2: Fixing database trigger..."
psql "$DATABASE_URL" -f fix-database-trigger.sql

if [ $? -eq 0 ]; then
    echo "✅ Successfully fixed database trigger"
else
    echo "❌ Failed to fix database trigger"
    exit 1
fi

# Step 3: Create or update the all_events_members view
echo ""
echo "🚀 Step 3: Creating all_events_members view..."
cat > create-all-events-members-view.sql << 'EOF'
-- Create or replace the all_events_members view
-- This view aggregates all user data including hobbies and expertise for matchmaking

CREATE OR REPLACE VIEW all_events_members AS
SELECT 
  em.event_id,
  em.user_id,
  em.joined_at,
  em.is_present,
  p.first_name,
  p.last_name,
  p.job_title,
  p.company,
  p.what_do_you_do,
  p.mbti,
  p.enneagram,
  p.avatar_url,
  p.networking_goals,
  p.hobbies,
  p.expertise_tags,
  e.matchmaking_enabled,
  CONCAT(p.first_name, ' ', p.last_name) as full_name,
  COALESCE(p.what_do_you_do, p.job_title, 'Professional') as job_description
FROM event_members em
JOIN profiles p ON em.user_id = p.id
JOIN events e ON em.event_id = e.id;

-- Grant necessary permissions
GRANT SELECT ON all_events_members TO authenticated;
GRANT SELECT ON all_events_members TO anon;

-- Success message
SELECT 'Successfully created all_events_members view!' as result;
EOF

psql "$DATABASE_URL" -f create-all-events-members-view.sql

if [ $? -eq 0 ]; then
    echo "✅ Successfully created all_events_members view"
else
    echo "❌ Failed to create all_events_members view"
    exit 1
fi

# Clean up temporary file
rm -f create-all-events-members-view.sql

echo ""
echo "🎉 All database changes applied successfully!"
echo ""
echo "The hobby storage system has been fixed:"
echo "✅ Hobbies and expertise are now stored as arrays in the profiles table"
echo "✅ Database triggers no longer reference non-existent fields"
echo "✅ Matchmaking system can now access hobby data properly"
echo ""
echo "You can now test profile creation - the error should be resolved!"
