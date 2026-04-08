-- Phase A: tenant stub + platform admin roster (optional complement to PLATFORM_ADMIN_USER_IDS).

create table if not exists public.organizations (
  organization_id uuid primary key default gen_random_uuid(),
  name text,
  plan_key text,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_admins (
  user_id uuid primary key references public.users (user_id) on delete cascade
);

alter table public.events
  add column if not exists organization_id uuid references public.organizations (organization_id) on delete set null;

create index if not exists events_organization_id_idx on public.events (organization_id);
