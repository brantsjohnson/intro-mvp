# 🧹 SUPABASE CLEANUP PLAN

## Overview
After the Supabase database wipe, this document outlines the cleanup plan to remove all database-dependent code while preserving the core functionality for future rebuild.

## ✅ PRESERVED ITEMS (DO NOT DELETE)

### 1. Edge Function
- `supabase/functions/matchmaker/index.ts` - **KEEP** (AI matchmaking logic)

### 2. Environment Variables (to be preserved)
- `NEXT_PUBLIC_SUPABASE_URL` - **KEEP**
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - **KEEP** 
- `SUPABASE_SERVICE_ROLE_KEY` - **KEEP**

### 3. AI/Matchmaking Logic
- `src/lib/score.ts` - **KEEP** (scoring algorithms)
- `src/lib/expertise-ai-service.ts` - **KEEP** (AI expertise suggestions)

### 4. UI Components
- All files in `src/components/` - **KEEP** (React components)
- All files in `src/app/` - **KEEP** (Next.js pages)

### 5. Configuration
- `vercel.json` - **KEEP** (Vercel deployment config)
- `next.config.ts` - **KEEP** (Next.js config)
- `package.json` - **KEEP** (dependencies)

## 🗑️ ITEMS TO CLEAN UP

### 1. Database Types (Replace with Placeholders)
- `src/lib/database.types.ts` → Replace with placeholder types

### 2. Supabase Client Files (Replace with Placeholders)
- `src/lib/supabase.ts` → Replace with placeholder client
- `src/lib/supabase-server.ts` → Replace with placeholder server client

### 3. API Routes (Replace with Placeholders)
- `src/app/api/admin-start-matching/route.ts`
- `src/app/api/auto-match-new-user/route.ts`
- `src/app/api/create-fresh-event/route.ts`
- `src/app/api/cron-refresh-matches/route.ts`
- `src/app/api/debug-tables/route.ts`
- `src/app/api/mark-match-met/route.ts`
- `src/app/api/messages/send/route.ts`
- `src/app/api/refresh-matches/route.ts`
- `src/app/api/smart-refresh-matches/route.ts`
- `src/app/api/update-fresh-event/route.ts`

### 4. Database-Dependent Services
- `src/lib/message-service-simple.ts` → Replace with placeholder
- `src/lib/qr-service.ts` → Replace with placeholder
- `src/lib/use-autosave.ts` → Replace with placeholder
- `src/lib/use-autosave-new.ts` → Replace with placeholder
- `src/lib/use-autosave-old.ts` → Replace with placeholder

### 5. SQL Files (Delete)
- All `.sql` files in root directory
- All files in `supabase/migrations/` (except edge function)

### 6. Test Files (Delete)
- `test-*.js` files
- `create-*.js` files
- `update-*.js` files

### 7. Documentation Files (Delete)
- `DEPLOYMENT_INSTRUCTIONS.md`
- `MATCHMAKING_DEPLOYMENT.md`
- `MESSAGING_SETUP.md`
- `SCALABLE_MATCHMAKING_SUMMARY.md`
- `SMART_REFRESH_SETUP.md`
- `HOBBY_STORAGE_FIX.md`

## 🔄 REPLACEMENT STRATEGY

### Placeholder Pattern
All database-dependent code will be replaced with:
1. **Placeholder functions** that return mock data
2. **TODO comments** indicating what needs to be rebuilt
3. **Type definitions** that match the expected interface
4. **Error handling** that gracefully handles missing database

### Example Placeholder:
```typescript
// TODO: Rebuild when Supabase is restored
export const placeholderFunction = async () => {
  console.warn('Database not available - using placeholder')
  return { data: null, error: { message: 'Database not configured' } }
}
```

## 📋 REBUILD CHECKLIST

When rebuilding Supabase, these items need to be restored:

### Database Tables
1. `profiles` - User profile information
2. `events` - Event management
3. `event_members` - User-event relationships
4. `hobbies` - Hobby definitions
5. `profile_hobbies` - User hobby relationships
6. `expertise_tags` - Expertise definitions
7. `profile_expertise` - User expertise relationships
8. `event_networking_goals` - Event-specific networking goals
9. `matches` - AI-generated matches
10. `connections` - User connections
11. `messages` - Messaging system
12. `message_threads` - Message threads
13. `notifications` - User notifications
14. `ai_jobs` - AI processing jobs
15. `user_event_stats` - User statistics

### Database Views
1. `all_events_members` - Combined event member data

### Database Functions
1. Matchmaking triggers
2. RLS policies
3. Database triggers

### API Endpoints
1. All API routes in `src/app/api/`
2. Authentication callbacks
3. Message handling
4. Event management
5. Match management

## 🎯 NEXT STEPS

1. ✅ Audit complete
2. 🔄 Replace database types with placeholders
3. 🔄 Replace Supabase clients with placeholders
4. 🔄 Replace API routes with placeholders
5. 🔄 Replace services with placeholders
6. 🔄 Delete SQL and test files
7. 🔄 Delete documentation files
8. ✅ Create rebuild guide

## 🚀 BENEFITS OF CLEANUP

1. **Clean Codebase** - No broken imports or database errors
2. **Clear Roadmap** - Obvious what needs to be rebuilt
3. **Preserved Logic** - AI and UI logic intact
4. **Easy Rebuild** - Placeholders show exact interface needed
5. **No Confusion** - Clear separation of what works vs what needs rebuilding

