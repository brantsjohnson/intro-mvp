-- Phase F: LLM-backed match explanation on sponsor leads (short sentence for UI)

alter table public.sponsor_leads
  add column if not exists match_explanation_text text;
