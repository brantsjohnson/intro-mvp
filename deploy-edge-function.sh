#!/bin/bash

# Deploy Edge Function for scalable matchmaking
# Run this after the database migrations are applied

echo "🚀 Deploying Matchmaker Edge Function..."

# Set environment variables (use your own keys)
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export OPENAI_API_KEY="your-openai-api-key"

# Deploy the function
~/.local/bin/supabase functions deploy matchmaker \
  --project-ref szrznjvllslymamzecyq \
  --no-verify-jwt

echo "✅ Edge Function deployed!"
echo "🧪 Testing the system..."

# Test the deployment
cd /Users/brantsjohnson/Desktop/intro-mvp
NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
node test-matchmaking.js

echo "🎉 Deployment complete! See MATCHMAKING_DEPLOYMENT.md for next steps."
