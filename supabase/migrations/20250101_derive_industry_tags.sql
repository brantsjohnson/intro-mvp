-- ============================================================
-- FUNCTION: Derive industry tags from company_summary
-- ============================================================
-- This function analyzes company_summary, company_name, and company_url
-- to derive industry tags and update the industry_tags column

CREATE OR REPLACE FUNCTION derive_industry_tags(
  p_company_summary TEXT,
  p_company_name TEXT,
  p_company_url TEXT
)
RETURNS TEXT[] AS $$
DECLARE
  v_text TEXT;
  v_tags TEXT[] := ARRAY[]::TEXT[];
  v_lower_text TEXT;
BEGIN
  -- Combine all text sources
  v_text := COALESCE(p_company_summary, '') || ' ' || 
            COALESCE(p_company_name, '') || ' ' || 
            COALESCE(p_company_url, '');
  v_lower_text := LOWER(v_text);
  
  -- Check for "for X" patterns first (strongest signal)
  IF v_lower_text ~* 'for\s+(law|legal|attorney|lawyer|law firm|litigation|compliance|regulatory|legal tech|legaltech)' THEN
    v_tags := array_append(v_tags, 'legal');
  END IF;
  
  IF v_lower_text ~* 'for\s+(fintech|financial technology|banking|payments|lending|investing|wealth management|crypto|blockchain|trading)' THEN
    v_tags := array_append(v_tags, 'fintech');
  END IF;
  
  IF v_lower_text ~* 'for\s+(healthcare|health|medical|hospital|clinic|patient|pharmaceutical|pharma)' THEN
    v_tags := array_append(v_tags, 'healthcare');
  END IF;
  
  IF v_lower_text ~* 'for\s+(education|school|university|college|learning|training|edtech)' THEN
    v_tags := array_append(v_tags, 'education');
  END IF;
  
  IF v_lower_text ~* 'for\s+(retail|store|shopping|merchandise|ecommerce|e-commerce|online retail|marketplace)' THEN
    v_tags := array_append(v_tags, 'retail');
  END IF;
  
  IF v_lower_text ~* 'for\s+(sports|athletic|athletes|fitness|performance|training|coaching)' THEN
    v_tags := array_append(v_tags, 'sports');
  END IF;
  
  IF v_lower_text ~* 'for\s+(restaurant|food|dining|catering|culinary|food service)' THEN
    v_tags := array_append(v_tags, 'food');
  END IF;
  
  IF v_lower_text ~* 'for\s+(real estate|realty|property|housing|construction|development)' THEN
    v_tags := array_append(v_tags, 'real_estate');
  END IF;
  
  IF v_lower_text ~* 'for\s+(travel|tourism|booking|hotel|accommodation|hospitality)' THEN
    v_tags := array_append(v_tags, 'travel');
  END IF;
  
  IF v_lower_text ~* 'for\s+(manufacturing|production|factory|industrial|supply chain)' THEN
    v_tags := array_append(v_tags, 'manufacturing');
  END IF;
  
  IF v_lower_text ~* 'for\s+(logistics|shipping|delivery|warehouse|fulfillment)' THEN
    v_tags := array_append(v_tags, 'logistics');
  END IF;
  
  -- Also check for direct keyword matches (without "for") - more flexible patterns
  IF v_lower_text ~* '\b(fintech|financial technology|banking|payments|payment|lending|investing|wealth management|crypto|blockchain|trading|checking account|financial|finance)\b' THEN
    IF NOT ('fintech' = ANY(v_tags)) THEN
      v_tags := array_append(v_tags, 'fintech');
    END IF;
  END IF;
  
  IF v_lower_text ~* '\b(legal|law|attorney|lawyer|law firm|litigation|compliance|regulatory|legal tech|legaltech)\b' THEN
    IF NOT ('legal' = ANY(v_tags)) THEN
      v_tags := array_append(v_tags, 'legal');
    END IF;
  END IF;
  
  IF v_lower_text ~* '\b(healthcare|health|medical|hospital|clinic|patient|pharmaceutical|pharma)\b' THEN
    IF NOT ('healthcare' = ANY(v_tags)) THEN
      v_tags := array_append(v_tags, 'healthcare');
    END IF;
  END IF;
  
  IF v_lower_text ~* '\b(education|school|university|college|learning|training|edtech)\b' THEN
    IF NOT ('education' = ANY(v_tags)) THEN
      v_tags := array_append(v_tags, 'education');
    END IF;
  END IF;
  
  IF v_lower_text ~* '\b(ecommerce|e-commerce|online retail|marketplace|dropshipping|online store|shopping|retail)\b' THEN
    IF NOT ('retail' = ANY(v_tags)) THEN
      v_tags := array_append(v_tags, 'retail');
    END IF;
  END IF;
  
  IF v_lower_text ~* '\b(sports|athletic|athletes|fitness|performance|training|coaching|gym|workout|exercise|athletic footwear|athletic apparel)\b' THEN
    IF NOT ('sports' = ANY(v_tags)) THEN
      v_tags := array_append(v_tags, 'sports');
    END IF;
  END IF;
  
  IF v_lower_text ~* '\b(telecom|telecommunications|communications|messaging|sms|voice|whatsapp|cpaas|communications platform|customer engagement|communication solutions|video conferencing|meeting)\b' THEN
    IF NOT ('telecom' = ANY(v_tags)) THEN
      v_tags := array_append(v_tags, 'telecom');
    END IF;
  END IF;
  
  -- SaaS detection - very common, check for platform, APIs, software, cloud
  IF v_lower_text ~* '\b(saas|software as a service|cloud software|platform|apis|api|software|cloud|enterprise software|business software)\b' THEN
    IF NOT ('saas' = ANY(v_tags)) THEN
      v_tags := array_append(v_tags, 'saas');
    END IF;
  END IF;
  
  IF v_lower_text ~* '\b(marketing|advertising|promotion|branding|campaign|digital marketing)\b' THEN
    IF NOT ('marketing' = ANY(v_tags)) THEN
      v_tags := array_append(v_tags, 'marketing');
    END IF;
  END IF;
  
  -- AI/ML companies
  IF v_lower_text ~* '\b(artificial intelligence|ai|machine learning|ml|deep learning|neural network|llm|large language model)\b' THEN
    IF NOT ('saas' = ANY(v_tags)) THEN
      v_tags := array_append(v_tags, 'saas');
    END IF;
  END IF;
  
  -- Social/professional networks
  IF v_lower_text ~* '\b(social network|professional network|social media|professionals|networking|linkedin|social platform)\b' THEN
    IF NOT ('saas' = ANY(v_tags)) THEN
      v_tags := array_append(v_tags, 'saas');
    END IF;
  END IF;
  
  -- Data/Analytics platforms
  IF v_lower_text ~* '\b(data platform|data analytics|analytics|data science|big data|unified platform|data processing)\b' THEN
    IF NOT ('saas' = ANY(v_tags)) THEN
      v_tags := array_append(v_tags, 'saas');
    END IF;
  END IF;
  
  IF v_lower_text ~* '\b(media|publishing|content|news|journalism|entertainment|music|video|streaming|gaming|games|video games|esports)\b' THEN
    IF v_lower_text ~* '\b(gaming|games|video games|esports|gamer)\b' THEN
      v_tags := array_append(v_tags, 'gaming');
    ELSIF v_lower_text ~* '\b(entertainment|music|video|streaming|content|production)\b' THEN
      v_tags := array_append(v_tags, 'entertainment');
    ELSE
      v_tags := array_append(v_tags, 'media');
    END IF;
  END IF;
  
  IF v_lower_text ~* '\b(consulting|consultant|advisory|strategy|professional services)\b' THEN
    v_tags := array_append(v_tags, 'consulting');
  END IF;
  
  IF v_lower_text ~* '\b(accounting|accountant|bookkeeping|financial services|cpa)\b' THEN
    v_tags := array_append(v_tags, 'accounting');
  END IF;
  
  -- Remove duplicates and return
  SELECT array_agg(DISTINCT tag) INTO v_tags
  FROM unnest(v_tags) AS tag;
  
  RETURN COALESCE(v_tags, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- FUNCTION: Update industry tags when company info changes
-- ============================================================
CREATE OR REPLACE FUNCTION update_user_industry_tags()
RETURNS TRIGGER AS $$
DECLARE
  v_derived_tags TEXT[];
  v_merged_tags TEXT[];
BEGIN
  -- Only update if company_summary, company_name, or company_url changed
  IF (TG_OP = 'UPDATE' AND 
      OLD.company_summary IS NOT DISTINCT FROM NEW.company_summary AND
      OLD.company_name IS NOT DISTINCT FROM NEW.company_name AND
      OLD.company_url IS NOT DISTINCT FROM NEW.company_url) THEN
    RETURN NEW;
  END IF;
  
  -- Derive tags from company information
  v_derived_tags := derive_industry_tags(
    NEW.company_summary,
    NEW.company_name,
    NEW.company_url
  );
  
  -- Merge with existing industry_tags (preserve manually added tags)
  IF NEW.industry_tags IS NOT NULL AND array_length(NEW.industry_tags, 1) > 0 THEN
    -- Merge: keep existing tags, add new derived ones
    SELECT array_agg(DISTINCT tag) INTO v_merged_tags
    FROM (
      SELECT unnest(NEW.industry_tags) AS tag
      UNION
      SELECT unnest(v_derived_tags) AS tag
    ) AS combined;
  ELSE
    -- No existing tags, use derived ones
    v_merged_tags := v_derived_tags;
  END IF;
  
  -- Update the industry_tags column
  NEW.industry_tags := v_merged_tags;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER: Auto-update industry_tags on company info changes
-- ============================================================
DROP TRIGGER IF EXISTS trigger_update_industry_tags ON public.users;

CREATE TRIGGER trigger_update_industry_tags
  BEFORE INSERT OR UPDATE OF company_summary, company_name, company_url ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_user_industry_tags();

-- ============================================================
-- BACKFILL: Update industry_tags for existing users
-- ============================================================
UPDATE public.users
SET industry_tags = derive_industry_tags(
  company_summary,
  company_name,
  company_url
)
WHERE (company_summary IS NOT NULL OR company_name IS NOT NULL OR company_url IS NOT NULL)
  AND (industry_tags IS NULL OR array_length(industry_tags, 1) = 0);

-- Success message
SELECT 'Industry tags trigger created and existing users backfilled!' as result;

