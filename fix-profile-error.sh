#!/bin/bash

# Fix profile creation error script
# This script fixes the database trigger that's causing the "hobbies" field error

echo "🔧 Fixing profile creation error..."
echo ""
echo "The error is caused by a database trigger that references non-existent fields."
echo "This script will fix the trigger to remove references to 'hobbies' and 'expertise_tags' fields."
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

# Run the SQL fix
echo "🚀 Applying database trigger fix..."
psql "$DATABASE_URL" -f fix-database-trigger.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database trigger fixed successfully!"
    echo ""
    echo "The profile creation error should now be resolved."
    echo "You can test by creating a new profile in your application."
else
    echo ""
    echo "❌ Failed to apply the database fix."
    echo "Please check your DATABASE_URL and try again."
    exit 1
fi
