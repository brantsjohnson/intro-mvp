# Scalable Matchmaking Deployment Guide

This guide will help you deploy the new queue-based matchmaking system that can scale to 500+ users.

## 🎯 What This Solves

- **Current Problem**: Matchmaking runs in Next.js API routes, causing timeouts with 14+ users
- **Solution**: Stateless Supabase Edge Function processes users in small batches via a queue
- **Scalability**: Can handle 500+ users without timeouts or memory issues

## 📋 Prerequisites

1. Supabase project with Edge Functions enabled
2. OpenAI API key (optional, fallback exists)
3. Database access for migrations

## 🚀 Deployment Steps

### 1. Deploy Database Migrations

Run these SQL migrations in your Supabase SQL editor:

```bash
# Apply the migrations in order:
supabase/migrations/20241201_matchmaking_queue.sql
supabase/migrations/20241201_matchmaking_triggers.sql
```

Or apply them via the Supabase dashboard SQL editor.

### 2. Deploy Edge Function

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the matchmaker function
supabase functions deploy matchmaker
```

### 3. Set Environment Variables

Add these to your Supabase Edge Function secrets:

```bash
# Required
supabase secrets set SUPABASE_URL=your_supabase_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional (for AI insights)
supabase secrets set OPENAI_API_KEY=your_openai_key
supabase secrets set OPENAI_MODEL=gpt-4o-mini

# Configuration
supabase secrets set BATCH_SIZE=20
supabase secrets set MAX_RUNTIME_MS=45000
```

### 4. Set Up Scheduled Function

Create a cron job that calls the matchmaker every minute:

```sql
-- In Supabase SQL editor, create a scheduled function
CREATE OR REPLACE FUNCTION trigger_matchmaker_cron()
RETURNS void AS $$
BEGIN
  -- This will be called by pg_cron every minute
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/matchmaker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  -- Log errors but don't fail the cron job
  RAISE LOG 'Matchmaker cron error: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule to run every minute
SELECT cron.schedule(
  'matchmaker-cron',
  '* * * * *', -- Every minute
  'SELECT trigger_matchmaker_cron();'
);
```

## 🎮 Usage

### Manual Trigger (Start Matchmaking)

```bash
# Start matchmaking for an event
curl -X POST "https://your-app.vercel.app/api/admin-start-matching" \
  -H "Content-Type: application/json" \
  -d '{"eventCode": "YOUR_EVENT_CODE", "priority": 0}'

# Check queue status
curl "https://your-app.vercel.app/api/admin-start-matching?eventCode=YOUR_EVENT_CODE"
```

### Direct Edge Function Call

```bash
# Trigger matchmaker directly
curl -X POST "https://YOUR_PROJECT.functions.supabase.co/matchmaker" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"event_id": "EVENT_UUID"}'
```

## 📊 Monitoring

### Check Queue Status

```sql
-- Get queue stats for all events
SELECT * FROM get_matchmaking_queue_stats();

-- Get detailed info for specific event
SELECT * FROM get_detailed_queue_info('EVENT_UUID');

-- Check current queue
SELECT 
  e.name as event_name,
  COUNT(*) as queue_size,
  MIN(q.enqueued_at) as oldest,
  MAX(q.enqueued_at) as newest
FROM matchmaking_queue q
JOIN events e ON e.id = q.event_id
GROUP BY e.id, e.name
ORDER BY queue_size DESC;
```

### Job Status

```sql
-- Check job status
SELECT 
  e.name as event_name,
  j.status,
  j.last_run_at,
  j.processed_count,
  j.error_count
FROM matchmaking_jobs j
JOIN events e ON e.id = j.event_id
ORDER BY j.last_run_at DESC;
```

## 🔧 Configuration

### Batch Size
- **Default**: 20 users per run
- **Adjust**: Set `BATCH_SIZE` environment variable
- **Recommendation**: 15-25 for optimal performance

### Runtime Limit
- **Default**: 45 seconds per function invocation
- **Adjust**: Set `MAX_RUNTIME_MS` environment variable
- **Purpose**: Prevents timeouts, allows cron to resume work

### Priority Levels
- **0**: Normal priority (new users)
- **1**: Medium priority (existing users re-matching)
- **2**: High priority (profile updates)
- **3**: Highest priority (event enable/initial setup)

## 🚨 Troubleshooting

### Queue Not Processing

1. Check job status:
```sql
SELECT * FROM matchmaking_jobs WHERE status = 'error';
```

2. Check for stuck jobs:
```sql
UPDATE matchmaking_jobs 
SET status = 'idle' 
WHERE status = 'running' 
AND last_run_at < NOW() - INTERVAL '10 minutes';
```

### Memory Issues

1. Reduce batch size:
```bash
supabase secrets set BATCH_SIZE=10
```

2. Check for large candidate pools:
```sql
SELECT event_id, COUNT(*) as candidate_count
FROM all_events_members 
GROUP BY event_id 
ORDER BY candidate_count DESC;
```

### OpenAI Errors

1. Check API key and quota
2. Fallback mode will work without OpenAI (basic matching only)

## 📈 Performance Expectations

- **14 users**: ~2-3 minutes for full matching
- **50 users**: ~10-15 minutes for full matching  
- **100 users**: ~20-30 minutes for full matching
- **500 users**: ~2-3 hours for full matching

**Note**: New users are matched immediately. Existing users only re-match when newcomers improve their top-3.

## 🔄 Migration from Current System

1. **Deploy new system** (this guide)
2. **Test with small event** (use admin-start-matching API)
3. **Update existing API routes** to use queue instead of direct processing
4. **Monitor performance** and adjust batch sizes as needed
5. **Gradually migrate** larger events

## 🆘 Emergency Procedures

### Pause All Matchmaking
```sql
UPDATE matchmaking_jobs SET status = 'paused';
```

### Resume Matchmaking
```sql
UPDATE matchmaking_jobs SET status = 'running';
```

### Clear Queue (Emergency Only)
```sql
DELETE FROM matchmaking_queue;
```

### Force Re-match All Users
```sql
SELECT enqueue_event_matchmaking(id, 3) FROM events WHERE matchmaking_enabled = true;
```

## 📞 Support

If you encounter issues:

1. Check the Supabase Edge Function logs
2. Review the queue status queries above
3. Verify environment variables are set correctly
4. Check OpenAI API key and quota if using AI features

The system is designed to be resilient - if one batch fails, the next cron run will continue processing the queue.
