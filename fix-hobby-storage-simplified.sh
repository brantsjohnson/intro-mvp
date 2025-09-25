#!/bin/bash

# Simplified fix for hobby storage system
# This script works with your existing all_events_members view

echo "🔧 Fixing hobby storage system (simplified version)..."
echo ""
echo "This script will:"
echo "1. Add hobbies and expertise_tags fields to profiles table"
echo "2. Fix the database trigger to remove non-existent field references"
echo "3. Update your existing all_events_members view to use the new fields"
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

# Step 3: Update the existing all_events_members view
echo ""
echo "🚀 Step 3: Updating all_events_members view..."
psql "$DATABASE_URL" -f update-all-events-members-view.sql

if [ $? -eq 0 ]; then
    echo "✅ Successfully updated all_events_members view"
else
    echo "❌ Failed to update all_events_members view"
    exit 1
fi

echo ""
echo "🎉 All database changes applied successfully!"
echo ""
echo "The hobby storage system has been fixed:"
echo "✅ Hobbies and expertise are now stored as arrays in the profiles table"
echo "✅ Database triggers no longer reference non-existent fields"
echo "✅ Your existing all_events_members view has been updated to use the new fields"
echo ""
echo "You can now test profile creation - the error should be resolved!"
