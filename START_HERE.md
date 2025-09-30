# 🚀 START HERE - Rebuild Your Database

## ⚡ Quick Execute (15 minutes total)

### Step 1: Open Supabase SQL Editor (1 min)
1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in left sidebar
4. Click **New Query**

### Step 2: Run Rebuild Script (5 min)
1. Open file: `supabase/rebuild-database-complete.sql`
2. Copy **ALL** contents (Cmd/Ctrl + A, then Cmd/Ctrl + C)
3. Paste into Supabase SQL Editor
4. Click **Run** (or Cmd/Ctrl + Enter)
5. Wait for "Success" message

### Step 3: Verify Rebuild (2 min)
1. Click **New Query** in Supabase SQL Editor
2. Open file: `supabase/verify-database.sql`
3. Copy ALL contents and paste
4. Click **Run**
5. Check all results show ✅

### Step 4: Test Edge Function (2 min)
1. Click **New Query** in Supabase SQL Editor
2. Open file: `supabase/test-edge-function.sql`
3. Copy ALL contents and paste
4. Click **Run**
5. Verify `what_do_you_do` field exists

### Step 5: Add Demo Event (1 min)
1. Click **New Query** in Supabase SQL Editor
2. Open file: `supabase/sample-data.sql`
3. Copy ALL contents and paste
4. Click **Run**
5. Demo event **DEMO2024** is created

### Step 6: Verify Environment Variables (2 min)
Check `.env.local` exists in project root with:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://szrznjvllslymamzecyq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### Step 7: Test Your App (2 min)
```bash
npm run dev
```

Then:
1. ✅ Sign up a new user
2. ✅ Complete onboarding  
3. ✅ Join event code: **DEMO2024**
4. ✅ Check matches appear
5. ✅ Send a message

---

## 📁 Files Overview

### SQL Scripts (run in Supabase SQL Editor)
1. **rebuild-database-complete.sql** - Main rebuild (run first)
2. **verify-database.sql** - Verification (run second)
3. **test-edge-function.sql** - Edge Function test (run third)
4. **sample-data.sql** - Demo data (run fourth)

### Documentation
- **REBUILD_COMPLETE_SUMMARY.md** - What was built
- **QUICK_START.md** - Quick reference
- **REBUILD_EXECUTION_STEPS.md** - Detailed steps
- **SUPABASE_REBUILD_GUIDE.md** - Full reference

### Code Updated
- `src/lib/supabase.ts` - Browser client (✅ ready)
- `src/lib/supabase-server.ts` - Server client (✅ ready)

---

## ✅ Success Indicators

After Step 2 (Rebuild):
- "Success. No rows returned" message appears
- No errors in console

After Step 3 (Verify):
- All tables show ✅
- RLS shows "✅ RLS Enabled"
- Triggers show "✅ Trigger exists"
- View shows "✅ all_events_members view exists"

After Step 4 (Edge Function Test):
- `what_do_you_do` shows "✅ Required by Edge Function"
- `shared_activities` shows "✅ Correct type (TEXT for JSON string)"

After Step 7 (Test App):
- User can sign up
- Onboarding flow works
- Event joining works
- Matches appear
- Messaging works

---

## 🆘 Troubleshooting

### "Table already exists" error
**Solution**: In Step 2, uncomment the DROP TABLE statements at the top of `rebuild-database-complete.sql` before running

### "Policy already exists" error
**Solution**: The script handles this automatically with `DROP POLICY IF EXISTS` - safe to ignore

### "Database not configured" errors in app
**Solution**: 
1. Verify `.env.local` has correct Supabase credentials
2. Restart dev server: `npm run dev`

### Edge Function can't access database
**Solution**: Verify `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` is correct

### No matches appearing
**Solution**:
1. Ensure event dates include today (starts_at < now < ends_at)
2. Check `is_active` and `matchmaking_enabled` are true
3. Verify user profile has data (job_title, hobbies, etc.)

---

## 🎯 What This Fixes

### Before (Broken)
- ❌ Database was wiped
- ❌ Placeholder Supabase clients
- ❌ Missing `what_do_you_do` field
- ❌ Edge Function couldn't access data
- ❌ App couldn't authenticate users

### After (Working)
- ✅ Complete database schema
- ✅ Real Supabase clients
- ✅ All Edge Function fields present
- ✅ Edge Function works perfectly
- ✅ Full authentication flow
- ✅ Matchmaking works
- ✅ Messaging works

---

## 📞 Need Help?

1. **Quick Start**: See `supabase/QUICK_START.md`
2. **Detailed Steps**: See `supabase/REBUILD_EXECUTION_STEPS.md`
3. **What Was Done**: See `REBUILD_COMPLETE_SUMMARY.md`
4. **Full Reference**: See `SUPABASE_REBUILD_GUIDE.md`

---

**Ready? Start with Step 1 above! 🚀**
