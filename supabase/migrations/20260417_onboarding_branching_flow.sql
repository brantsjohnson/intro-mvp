-- Branching onboarding flow v2: separate transcript JSON + user-confirmed final summaries
-- Consumed by src/app/api/onboarding/* routes and src/components/onboarding/event-branching-onboarding.tsx
-- Matchmaker continues to read event_profile_summary_text / offer_summary_text;
-- src/app/api/derive-attendance/route.ts bridges final summaries into those columns.

alter table public.attendance
  add column if not exists need_flow_state_json jsonb,
  add column if not exists need_summary_final text,
  add column if not exists offer_flow_state_json jsonb,
  add column if not exists offer_summary_final text,
  add column if not exists flow_onboarding_version smallint;

comment on column public.attendance.need_flow_state_json is
  'Branching need-flow transcript: { version, node_path: [{ node_id, question, options?, answer }], draft_summary, is_confirmed, asked_count }';
comment on column public.attendance.need_summary_final is
  'User-approved one-sentence summary of what this person is looking for at the event. Source of truth for matching.';
comment on column public.attendance.offer_flow_state_json is
  'Branching offer-flow transcript (same shape as need_flow_state_json).';
comment on column public.attendance.offer_summary_final is
  'User-approved one-sentence summary of what this person can offer at the event.';
comment on column public.attendance.flow_onboarding_version is
  '2 = new branching flow with user-confirmed summaries; null/1 = legacy event onboarding.';
