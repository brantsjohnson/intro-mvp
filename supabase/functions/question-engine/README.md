# Question Engine Edge Function

This Edge Function handles adaptive Q&A questions during onboarding.

## Deployment

To deploy this function to Supabase, run:

```bash
supabase functions deploy question-engine --project-ref YOUR_PROJECT_REF
```

To get your project ref:
1. Go to your Supabase project dashboard
2. Click on Settings > General
3. Copy the "Reference ID" (or use the project URL)

Or if you're using the Supabase CLI and have linked your project:

```bash
supabase functions deploy question-engine
```

## Environment Variables

Make sure these are set in your Supabase project:
- `SUPABASE_URL` (automatically available)
- `SUPABASE_SERVICE_ROLE_KEY` (automatically available)

## Testing

Once deployed, the function will be available at:
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/question-engine`

The Next.js API route `/api/questions/next` will call this function automatically.
