-- Update matches table to break out panels into separate columns
-- This migration adds new columns and migrates existing data

-- Add new columns
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS why_meet TEXT,
ADD COLUMN IF NOT EXISTS shared_activities TEXT,
ADD COLUMN IF NOT EXISTS dive_deeper TEXT;

-- Migrate existing data from panels JSON to separate columns
UPDATE matches 
SET 
  why_meet = COALESCE(panels->>'why_meet', 'You share complementary focus areas and could learn from each other''s different approaches.'),
  shared_activities = COALESCE(panels->>'shared_activities', '["Compare favorite shows", "Trade local food spots"]'),
  dive_deeper = COALESCE(panels->>'dive_deeper', 'What would make this week feel genuinely worthwhile for you?')
WHERE panels IS NOT NULL;

-- Set default values for any remaining NULL entries
UPDATE matches 
SET 
  why_meet = 'You share complementary focus areas and could learn from each other''s different approaches.',
  shared_activities = '["Compare favorite shows", "Trade local food spots"]',
  dive_deeper = 'What would make this week feel genuinely worthwhile for you?'
WHERE why_meet IS NULL OR shared_activities IS NULL OR dive_deeper IS NULL;

-- Add constraints to ensure these columns are not null going forward
ALTER TABLE matches 
ALTER COLUMN why_meet SET NOT NULL,
ALTER COLUMN shared_activities SET NOT NULL,
ALTER COLUMN dive_deeper SET NOT NULL;

-- Drop the panels column since we now have separate columns
ALTER TABLE matches DROP COLUMN panels;
