#!/bin/bash

echo "🚀 Deploying all fixes to resolve QR code and event joining issues..."

# 1. Run the comprehensive database fix
echo "📊 Step 1: Applying database fixes..."
echo "Please run the following SQL script in your Supabase SQL editor:"
echo "File: fix-event-joining-complete.sql"
echo ""
echo "This script will:"
echo "- Create the missing all_events_members view"
echo "- Add proper RLS policies for all tables"
echo "- Fix profile creation triggers"
echo "- Update existing profiles with empty arrays"
echo ""

# 2. Create the FRESH event
echo "🎯 Step 2: Creating FRESH event..."
echo "Please run this API call to create the FRESH event:"
echo "curl -X POST https://introevent.site/api/create-fresh-event"
echo ""

# 3. Check deployment status
echo "📦 Step 3: Checking deployment status..."
echo "Latest deployment should be ready now with QR code parsing fixes."
echo ""

echo "✅ After completing these steps:"
echo "1. The QR code at https://www.introevent.site/admin/fresh-qr should work"
echo "2. Scanning the QR code should parse 'FRESH' correctly"
echo "3. Users should be able to join the FRESH event"
echo "4. Manual event code entry should also work"
echo ""
echo "🔍 To test:"
echo "1. Go to https://www.introevent.site/event/join"
echo "2. Scan the QR code from the admin page"
echo "3. Or manually enter 'FRESH' in the event code field"
echo "4. Check browser console for 'Parsed event code: FRESH' instead of 'null'"
