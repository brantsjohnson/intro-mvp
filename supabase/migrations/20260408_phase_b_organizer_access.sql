-- Phase B: organizer read-only dashboard access (event-scoped).

create table if not exists public.organizer_memberships (
  user_id uuid not null references public.users (user_id) on delete cascade,
  organization_id uuid not null references public.organizations (organization_id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);

create index if not exists organizer_memberships_user_idx on public.organizer_memberships (user_id);
create index if not exists organizer_memberships_org_idx on public.organizer_memberships (organization_id);

create table if not exists public.event_organizers (
  event_id uuid not null references public.events (event_id) on delete cascade,
  user_id uuid not null references public.users (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_organizers_user_idx on public.event_organizers (user_id);
create index if not exists event_organizers_event_idx on public.event_organizers (event_id);
