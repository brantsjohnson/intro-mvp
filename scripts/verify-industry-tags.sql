-- Quick verification and manual trigger script
-- Run this in Supabase SQL Editor to check and manually trigger industry tag updates

-- 1. Check if the function exists
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'derive_industry_tags'
) as function_exists;

-- 2. Check if the trigger exists
SELECT EXISTS (
  SELECT 1 FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public' 
    AND c.relname = 'users'
    AND t.tgname = 'trigger_update_industry_tags'
) as trigger_exists;

-- 3. Check a sample user's industry_tags
SELECT 
  user_id,
  company_name,
  LEFT(company_summary, 50) as company_summary_preview,
  industry_tags,
  array_length(industry_tags, 1) as tag_count
FROM public.users
WHERE company_summary IS NOT NULL
LIMIT 10;

-- 4. Test the function on a sample user
SELECT 
  company_name,
  company_summary,
  derive_industry_tags(company_summary, company_name, company_url) as derived_tags
FROM public.users
WHERE company_summary IS NOT NULL
LIMIT 5;

-- 5. Manually trigger updates for all users (if needed)
-- Uncomment the line below to force update all users:
-- UPDATE public.users SET company_summary = company_summary WHERE company_summary IS NOT NULL;

