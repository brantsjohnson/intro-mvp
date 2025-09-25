-- Add columns to track when matches are met
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS is_met BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS met_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient querying of met matches
CREATE INDEX IF NOT EXISTS idx_matches_is_met ON matches(is_met) WHERE is_met = TRUE;
CREATE INDEX IF NOT EXISTS idx_matches_met_at ON matches(met_at) WHERE met_at IS NOT NULL;

-- Add comment explaining the purpose
COMMENT ON COLUMN matches.is_met IS 'Whether the user has marked this match as met';
COMMENT ON COLUMN matches.met_at IS 'When the user marked this match as met';
