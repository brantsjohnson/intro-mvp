-- Complete fix for all RLS policy issues
-- This addresses the expertise_tags and other policy problems

-- 1. Fix expertise_tags policies
DROP POLICY IF EXISTS "Anyone can insert expertise tags" ON public.expertise_tags;
DROP POLICY IF EXISTS "Anyone can update expertise tags" ON public.expertise_tags;

CREATE POLICY "Anyone can insert expertise tags" ON public.expertise_tags
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update expertise tags" ON public.expertise_tags
  FOR UPDATE USING (true);

-- 2. Ensure profile_hobbies policies are correct
DROP POLICY IF EXISTS "Users can manage their own hobbies" ON public.profile_hobbies;
CREATE POLICY "Users can manage their own hobbies" ON public.profile_hobbies
  FOR ALL USING (auth.uid() = user_id);

-- 3. Ensure profile_expertise policies are correct  
DROP POLICY IF EXISTS "Users can manage their own expertise" ON public.profile_expertise;
CREATE POLICY "Users can manage their own expertise" ON public.profile_expertise
  FOR ALL USING (auth.uid() = user_id);

-- 4. Test that we can query expertise_tags
-- This should work after the above policies are applied
SELECT * FROM public.expertise_tags LIMIT 5;
