-- Phase D: Sponsor intelligence — profiles, leads, interaction log, ML signal view.

create table if not exists public.sponsor_profiles (
  event_id uuid not null references public.events (event_id) on delete cascade,
  user_id uuid not null references public.users (user_id) on delete cascade,
  company_description text,
  product_offering text,
  ideal_customer_json jsonb not null default '{}'::jsonb,
  event_goals text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists sponsor_profiles_user_idx on public.sponsor_profiles (user_id);

create table if not exists public.sponsor_leads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (event_id) on delete cascade,
  sponsor_user_id uuid not null references public.users (user_id) on delete cascade,
  attendee_user_id uuid not null references public.users (user_id) on delete cascade,
  status text not null default 'recommended'
    check (status in ('recommended', 'messaged', 'replied', 'connected', 'linkedin', 'met')),
  recommendation_score numeric,
  recommendation_reason_tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, sponsor_user_id, attendee_user_id)
);

create index if not exists sponsor_leads_sponsor_event_idx on public.sponsor_leads (event_id, sponsor_user_id);
create index if not exists sponsor_leads_attendee_idx on public.sponsor_leads (attendee_user_id);

create table if not exists public.sponsor_interaction_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (event_id) on delete cascade,
  sponsor_user_id uuid not null references public.users (user_id) on delete cascade,
  attendee_user_id uuid not null references public.users (user_id) on delete cascade,
  event_type text not null
    check (event_type in (
      'message_sent',
      'reply_received',
      'connection_accepted',
      'linkedin_logged',
      'met_marked'
    )),
  occurred_at timestamptz not null default now(),
  metadata_json jsonb
);

create index if not exists sponsor_interaction_events_triplet_idx
  on public.sponsor_interaction_events (event_id, sponsor_user_id, attendee_user_id);
create index if not exists sponsor_interaction_events_sponsor_time_idx
  on public.sponsor_interaction_events (sponsor_user_id, occurred_at desc);

-- ML training helper: derived weight per lead from events + status
create or replace view public.sponsor_signal_outcomes as
select
  sl.id as lead_id,
  sl.event_id,
  sl.sponsor_user_id,
  sl.attendee_user_id,
  sl.status as lead_status,
  sl.recommendation_score,
  exists (
    select 1 from public.sponsor_interaction_events e
    where e.event_id = sl.event_id
      and e.sponsor_user_id = sl.sponsor_user_id
      and e.attendee_user_id = sl.attendee_user_id
      and e.event_type = 'met_marked'
  ) as has_met_event,
  exists (
    select 1 from public.sponsor_interaction_events e
    where e.event_id = sl.event_id
      and e.sponsor_user_id = sl.sponsor_user_id
      and e.attendee_user_id = sl.attendee_user_id
      and e.event_type = 'reply_received'
  ) as has_reply_event,
  exists (
    select 1 from public.sponsor_interaction_events e
    where e.event_id = sl.event_id
      and e.sponsor_user_id = sl.sponsor_user_id
      and e.attendee_user_id = sl.attendee_user_id
      and e.event_type = 'linkedin_logged'
  ) as has_linkedin_event,
  exists (
    select 1 from public.sponsor_interaction_events e
    where e.event_id = sl.event_id
      and e.sponsor_user_id = sl.sponsor_user_id
      and e.attendee_user_id = sl.attendee_user_id
      and e.event_type = 'message_sent'
  ) as has_message_event,
  (
    case
      when sl.status = 'met'
        or exists (
          select 1 from public.sponsor_interaction_events e
          where e.event_id = sl.event_id
            and e.sponsor_user_id = sl.sponsor_user_id
            and e.attendee_user_id = sl.attendee_user_id
            and e.event_type = 'met_marked'
        )
      then 1.0::double precision
      when exists (
          select 1 from public.sponsor_interaction_events e
          where e.event_id = sl.event_id
            and e.sponsor_user_id = sl.sponsor_user_id
            and e.attendee_user_id = sl.attendee_user_id
            and e.event_type = 'reply_received'
        )
        and exists (
          select 1 from public.sponsor_interaction_events e
          where e.event_id = sl.event_id
            and e.sponsor_user_id = sl.sponsor_user_id
            and e.attendee_user_id = sl.attendee_user_id
            and e.event_type = 'linkedin_logged'
        )
      then 0.8::double precision
      when exists (
          select 1 from public.sponsor_interaction_events e
          where e.event_id = sl.event_id
            and e.sponsor_user_id = sl.sponsor_user_id
            and e.attendee_user_id = sl.attendee_user_id
            and e.event_type = 'reply_received'
        )
      then 0.6::double precision
      when exists (
          select 1 from public.sponsor_interaction_events e
          where e.event_id = sl.event_id
            and e.sponsor_user_id = sl.sponsor_user_id
            and e.attendee_user_id = sl.attendee_user_id
            and e.event_type = 'linkedin_logged'
        )
      then 0.4::double precision
      when sl.status in ('messaged', 'replied', 'connected', 'linkedin')
        or exists (
          select 1 from public.sponsor_interaction_events e
          where e.event_id = sl.event_id
            and e.sponsor_user_id = sl.sponsor_user_id
            and e.attendee_user_id = sl.attendee_user_id
            and e.event_type = 'message_sent'
        )
      then 0.1::double precision
      else 0.0::double precision
    end
  ) as signal_weight
from public.sponsor_leads sl;
