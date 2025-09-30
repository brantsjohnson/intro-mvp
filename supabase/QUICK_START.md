# 🚀 Quick Start - Database Rebuild

## 1️⃣ Run the Main Rebuild Script

Copy and paste this into **Supabase SQL Editor**:

```sql
-- Open: /Users/brantsjohnson/Desktop/intro-mvp/supabase/rebuild-database-complete.sql
-- Copy the entire contents and run in Supabase SQL Editor
```

This will:
- Create all tables
- Create the critical `all_events_members` view
- Enable RLS on all tables
- Create RLS policies
- Create database triggers
- Create performance indexes

## 2️⃣ Verify the Rebuild

Copy and paste this into **Supabase SQL Editor**:

```sql
-- Open: /Users/brantsjohnson/Desktop/intro-mvp/supabase/verify-database.sql
-- Copy the entire contents and run in Supabase SQL Editor
```

Expected results:
- ✅ All 11 tables exist
- ✅ RLS enabled on all tables
- ✅ 2 triggers exist (handle_new_user, create_message_thread)
- ✅ all_events_members view exists and is queryable
- ✅ RLS policies exist for all tables

## 3️⃣ Test Edge Function Compatibility

Copy and paste this into **Supabase SQL Editor**:

```sql
-- Open: /Users/brantsjohnson/Desktop/intro-mvp/supabase/test-edge-function.sql
-- Copy the entire contents and run in Supabase SQL Editor
```

Expected results:
- ✅ all_events_members has all required fields including `what_do_you_do`
- ✅ matches table has correct structure
- ✅ shared_activities is TEXT type (for JSON string)

## 4️⃣ Insert Sample Data

Copy and paste this into **Supabase SQL Editor**:

```sql
-- Open: /Users/brantsjohnson/Desktop/intro-mvp/supabase/sample-data.sql
-- Copy the entire contents and run in Supabase SQL Editor
```

This creates a demo event with code: **DEMO2024**

## 5️⃣ Verify Environment Variables

Check your `.env.local` file has:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://szrznjvllslymamzecyq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

## 6️⃣ Test Your App

```bash
npm run dev
```

Then:
1. ✅ Sign up a new user
2. ✅ Complete onboarding
3. ✅ Join event: **DEMO2024**
4. ✅ Test matchmaking
5. ✅ Test messaging

## 📝 Files Created

- ✅ `rebuild-database-complete.sql` - Main rebuild script
- ✅ `verify-database.sql` - Verification script
- ✅ `test-edge-function.sql` - Edge Function compatibility test
- ✅ `sample-data.sql` - Sample data insertion
- ✅ `REBUILD_EXECUTION_STEPS.md` - Detailed step-by-step guide
- ✅ Updated Supabase client files (removed placeholders)

## ⚠️ Critical Notes

1. **DO NOT MODIFY** the Edge Function code
2. **DO NOT CHANGE** database field names
3. The `what_do_you_do` field is **REQUIRED** by the Edge Function
4. The `shared_activities` field must be **TEXT** (stores JSON as string)

## 🆘 Troubleshooting

### Issue: Tables already exist
Uncomment the DROP TABLE statements at the top of `rebuild-database-complete.sql`

### Issue: Environment variables not found
Create `.env.local` file in project root with your Supabase credentials

### Issue: Edge Function can't access database
Verify your `SUPABASE_SERVICE_ROLE_KEY` is correct

## ✅ Success Checklist

- [ ] Database rebuild script executed successfully
- [ ] All verification checks pass
- [ ] Edge Function compatibility confirmed
- [ ] Sample event created (DEMO2024)
- [ ] Environment variables configured
- [ ] App runs without errors
- [ ] User sign-up works
- [ ] Matchmaking works
- [ ] Messaging works

---

**You're ready to go! 🎉**
