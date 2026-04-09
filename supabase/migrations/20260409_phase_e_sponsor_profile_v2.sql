-- Phase E: Sponsor profile sponsorship_cost + extended lead statuses for CRM-style pipeline

alter table public.sponsor_profiles
  add column if not exists sponsorship_cost numeric;

-- PG may auto-name the column check; drop any existing check on status
do $$
declare
  cname text;
begin
  select pg_constraint.conname into cname
  from pg_constraint
  join pg_attribute on pg_attribute.attrelid = pg_constraint.conrelid
    and pg_attribute.attnum = any (pg_constraint.conkey)
  where pg_constraint.conrelid = 'public.sponsor_leads'::regclass
    and pg_constraint.contype = 'c'
    and pg_attribute.attname = 'status'
  limit 1;
  if cname is not null then
    execute format('alter table public.sponsor_leads drop constraint %I', cname);
  end if;
end $$;

alter table public.sponsor_leads add constraint sponsor_leads_status_check
  check (status in (
    'recommended',
    'messaged',
    'replied',
    'connected',
    'linkedin',
    'met',
    'reached_out',
    'contacted_later',
    'closed_deal'
  ));
