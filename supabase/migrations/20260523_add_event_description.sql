-- Add a free-text description of what the event is actually about.
-- This becomes the source of truth for AI onboarding follow-ups (e.g. Branch B
-- "Learn about the topic"), which previously had only the event name + the raw
-- onboarding_question_schema JSON to work from and would invent generic topics
-- (e.g. "Social media design", "Community building") with no grounding.
--
-- The column is optional so existing events do not break. When empty, the AI
-- falls back to its prior behaviour.

alter table public.events
  add column if not exists event_description text;

comment on column public.events.event_description is
  'Organizer-authored description of what is happening at the event (topics, sessions, theme, audience, etc.). Surfaced to the onboarding AI as ground truth for any event-anchored follow-up question so the AI does not invent topics.';
