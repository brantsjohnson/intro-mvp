#!/bin/bash

# Deploy Edge Function for scalable matchmaking
# Run this after the database migrations are applied

echo "🚀 Deploying Matchmaker Edge Function..."

# Load environment variables from .env.local
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
  echo "✅ Loaded environment variables from .env.local"
else
  echo "❌ .env.local file not found!"
  echo "Please create .env.local with your environment variables:"
  echo "  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co"
  echo "  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key"
  echo "  OPENAI_API_KEY=your-openai-api-key"
  exit 1
fi

# Set deployment variables
export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
export OPENAI_API_KEY="$OPENAI_API_KEY"

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
