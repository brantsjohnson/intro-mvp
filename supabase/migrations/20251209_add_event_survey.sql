-- Event survey tables
-- Stores tokens used to authorize survey access and the submitted responses.

create table if not exists public.event_survey_tokens (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(event_id) on delete cascade,
  recipient_user_id uuid references public.users(user_id),
  recipient_email text not null,
  token text not null unique,
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists event_survey_tokens_event_idx on public.event_survey_tokens(event_id);
create index if not exists event_survey_tokens_token_idx on public.event_survey_tokens(token);
create index if not exists event_survey_tokens_user_idx on public.event_survey_tokens(recipient_user_id);

create table if not exists public.event_survey_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(event_id) on delete cascade,
  token_id uuid references public.event_survey_tokens(id) on delete set null,
  recipient_user_id uuid references public.users(user_id),
  recipient_email text,
  rating_custom integer,
  rating_useful integer,
  rating_business integer,
  open_answer text,
  custom_question text,
  created_at timestamptz not null default now()
);

create index if not exists event_survey_responses_event_idx on public.event_survey_responses(event_id);

