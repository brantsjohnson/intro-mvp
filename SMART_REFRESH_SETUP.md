# Smart Refresh System Setup

## Overview

The smart refresh system automatically improves matches for users in live events by:

1. **Every 10 minutes**: Checking for users who might need better matches
2. **When user marks match as "met"**: Immediately refreshing that user's matches

## How It Works

### 🕐 Periodic Refresh (Every 10 minutes)
- Finds users whose matches are older than 10 minutes
- Only processes 5 users at a time to avoid overload
- Only affects users who might benefit from new matches

### 🎯 User-Triggered Refresh (When marking match as met)
- Immediately processes the specific user who marked a match as met
- Finds better matches from all available users in the event
- Doesn't affect other users' matches

## API Endpoints

### 1. Smart Refresh
```
POST /api/smart-refresh-matches
{
  "eventCode": "FRESH",
  "userId": "optional-user-id", // If provided, only refresh this user
  "reason": "periodic_check" // or "user_met_match"
}
```

### 2. Mark Match as Met
```
POST /api/mark-match-met
{
  "matchId": "match-uuid",
  "userId": "user-uuid", 
  "eventId": "event-uuid"
}
```

### 3. Cron Job
```
GET /api/cron-refresh-matches
Authorization: Bearer your-cron-secret
```

## Setting Up the Cron Job

### Option 1: Vercel Cron Jobs
Add to your `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron-refresh-matches",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

### Option 2: External Cron Service
Use a service like:
- **cron-job.org**
- **EasyCron**
- **SetCronJob**

Set up a GET request to:
```
https://your-domain.com/api/cron-refresh-matches
Authorization: Bearer your-cron-secret
Schedule: Every 10 minutes
```

### Option 3: GitHub Actions
Create `.github/workflows/smart-refresh.yml`:
```yaml
name: Smart Refresh Matches
on:
  schedule:
    - cron: '*/10 * * * *' # Every 10 minutes
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Smart Refresh
        run: |
          curl -X GET "https://your-domain.com/api/cron-refresh-matches" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

## Environment Variables

Add to your `.env.local`:
```bash
CRON_SECRET=your-secure-random-string
```

## Database Migration

Run the migration to add the new columns:
```sql
-- This is already created in supabase/migrations/20241201_add_met_columns_to_matches.sql
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS is_met BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS met_at TIMESTAMP WITH TIME ZONE;
```

## Benefits

✅ **Efficient**: Only processes users who need it
✅ **Real-time**: Immediate refresh when user marks match as met  
✅ **Scalable**: Processes 5 users at a time to avoid overload
✅ **Smart**: Only refreshes if event is live and matchmaking is enabled
✅ **Non-disruptive**: Doesn't affect existing matches unnecessarily

## Testing

Use the test script:
```bash
node test-smart-refresh.js
```

Or test individual endpoints:
```bash
# Test periodic refresh
curl -X POST "http://localhost:3000/api/smart-refresh-matches" \
  -H "Content-Type: application/json" \
  -d '{"eventCode": "FRESH", "reason": "test"}'

# Test cron job
curl -X GET "http://localhost:3000/api/cron-refresh-matches" \
  -H "Authorization: Bearer your-cron-secret"
```
