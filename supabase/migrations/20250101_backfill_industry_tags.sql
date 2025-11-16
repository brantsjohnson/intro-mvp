-- ============================================================
-- BACKFILL: Update industry_tags for all existing users
-- ============================================================
-- This will replace old/wrong industry_tags with correctly derived ones
-- based on current company_summary, company_name, and company_url

UPDATE public.users
SET industry_tags = derive_industry_tags(
  company_summary,
  company_name,
  company_url
)
WHERE (company_summary IS NOT NULL OR company_name IS NOT NULL OR company_url IS NOT NULL);

-- Show results
SELECT 
  company_name,
  LEFT(company_summary, 60) as summary_preview,
  industry_tags,
  array_length(industry_tags, 1) as tag_count
FROM public.users
WHERE company_summary IS NOT NULL
  AND industry_tags IS NOT NULL
ORDER BY array_length(industry_tags, 1) DESC
LIMIT 20;

