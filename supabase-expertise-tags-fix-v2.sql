-- Fix for expertise_tags RLS policies
-- The table has RLS enabled but missing INSERT/UPDATE policies

-- Add missing policies for expertise_tags table
create policy "Anyone can insert expertise tags" on public.expertise_tags
  for insert with check (true);

create policy "Anyone can update expertise tags" on public.expertise_tags
  for update using (true);
