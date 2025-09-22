-- Users and auth
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  created_at timestamptz default now(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  avatar_url text,
  job_title text,
  company text,
  location text,
  linkedin_url text,
  mbti text check (char_length(mbti) <= 4),
  enneagram text, -- e.g., '8' or '8w7'
  networking_goals text[], -- array of networking goals including custom ones
  consent boolean default false
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code)=5),
  name text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  header_image_url text, -- manually uploaded into storage with this path
  is_active boolean default true,
  matchmaking_enabled boolean default false -- admin can enable/disable matching for this event
);

create table public.event_members (
  event_id uuid references public.events on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  joined_at timestamptz default now(),
  is_present boolean default false,
  primary key (event_id, user_id)
);

create table public.hobbies (
  id serial primary key,
  label text unique not null
);

create table public.profile_hobbies (
  user_id uuid references public.profiles on delete cascade,
  hobby_id int references public.hobbies on delete cascade,
  primary key (user_id, hobby_id)
);

create table public.expertise_tags (
  id serial primary key,
  label text unique not null
);

create table public.profile_expertise (
  user_id uuid references public.profiles on delete cascade,
  tag_id int references public.expertise_tags on delete cascade,
  primary key (user_id, tag_id)
);

create table public.event_networking_goals (
  event_id uuid references public.events on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  networking_goals text[] not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (event_id, user_id)
);

create type match_basis as enum ('career','personality','interests');

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events on delete cascade,
  a uuid references public.profiles on delete cascade,
  b uuid references public.profiles on delete cascade,
  bases match_basis[] not null,          -- e.g., '{career,interests}'
  summary text not null,                 -- one sentence why
  panels jsonb not null,                 -- ai output with 3 sections: why/activities/deeper
  created_at timestamptz default now(),
  is_system boolean default true         -- set false if human-curated later
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events on delete cascade,
  a uuid references public.profiles on delete cascade,
  b uuid references public.profiles on delete cascade,
  source text check (source in ('qr','match')),
  created_at timestamptz default now(),
  unique (event_id, a, b)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events on delete cascade,
  thread_id uuid not null,
  sender uuid references public.profiles on delete set null,
  recipient uuid references public.profiles on delete set null,
  body text not null,
  created_at timestamptz default now()
);

create index on public.messages (thread_id, created_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade,
  type text,              -- 'new_matches', 'message'
  payload jsonb,
  sent_at timestamptz
);

-- For AI jobs the owner manually triggers
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events on delete cascade,
  status text check (status in ('queued','running','completed','failed')) default 'queued',
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Derived analytics: keep running totals (not shown to users)
create table public.user_event_stats (
  event_id uuid references public.events on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  qr_connections int default 0,
  match_connections int default 0,
  primary key (event_id, user_id)
);

-- Seed hobbies
insert into public.hobbies (label) values 
('Wellness'),
('Arts & Music'),
('Outdoors & Travel'),
('Home & Lifestyle'),
('Health'),
('Food & Drink'),
('Comedy'),
('Business'),
('Gaming'),
('Films'),
('Fashion'),
('Community');

-- RLS Policies
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.hobbies enable row level security;
alter table public.profile_hobbies enable row level security;
alter table public.expertise_tags enable row level security;
alter table public.profile_expertise enable row level security;
alter table public.event_networking_goals enable row level security;
alter table public.matches enable row level security;
alter table public.connections enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.user_event_stats enable row level security;

-- Profiles policies
create policy "Users can view profiles of event attendees" on public.profiles
  for select using (
    exists (
      select 1 from public.event_members em1
      join public.event_members em2 on em1.event_id = em2.event_id
      where em1.user_id = auth.uid() and em2.user_id = profiles.id
    )
  );

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Events policies
create policy "Users can view events they're members of" on public.events
  for select using (
    exists (
      select 1 from public.event_members
      where event_id = events.id and user_id = auth.uid()
    )
  );

-- Event members policies
create policy "Users can view event members of their events" on public.event_members
  for select using (
    exists (
      select 1 from public.event_members em
      where em.event_id = event_members.event_id and em.user_id = auth.uid()
    )
  );

create policy "Users can join events" on public.event_members
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own presence" on public.event_members
  for update using (auth.uid() = user_id);

-- Hobbies policies
create policy "Anyone can view hobbies" on public.hobbies
  for select using (true);

-- Profile hobbies policies
create policy "Users can view profile hobbies of event attendees" on public.profile_hobbies
  for select using (
    exists (
      select 1 from public.event_members em1
      join public.event_members em2 on em1.event_id = em2.event_id
      where em1.user_id = auth.uid() and em2.user_id = profile_hobbies.user_id
    )
  );

create policy "Users can manage their own hobbies" on public.profile_hobbies
  for all using (auth.uid() = user_id);

-- Expertise tags policies
create policy "Anyone can view expertise tags" on public.expertise_tags
  for select using (true);

-- Profile expertise policies
create policy "Users can view profile expertise of event attendees" on public.profile_expertise
  for select using (
    exists (
      select 1 from public.event_members em1
      join public.event_members em2 on em1.event_id = em2.event_id
      where em1.user_id = auth.uid() and em2.user_id = profile_expertise.user_id
    )
  );

create policy "Users can manage their own expertise" on public.profile_expertise
  for all using (auth.uid() = user_id);

-- Event networking goals policies
create policy "Users can view networking goals of event attendees" on public.event_networking_goals
  for select using (
    exists (
      select 1 from public.event_members em1
      join public.event_members em2 on em1.event_id = em2.event_id
      where em1.user_id = auth.uid() and em2.user_id = event_networking_goals.user_id
    )
  );

create policy "Users can manage their own event networking goals" on public.event_networking_goals
  for all using (auth.uid() = user_id);

-- Matches policies
create policy "Users can view their matches" on public.matches
  for select using (auth.uid() = a or auth.uid() = b);

-- Connections policies
create policy "Users can view their connections" on public.connections
  for select using (auth.uid() = a or auth.uid() = b);

create policy "Users can create connections" on public.connections
  for insert with check (auth.uid() = a or auth.uid() = b);

-- Messages policies
create policy "Users can view messages in their threads" on public.messages
  for select using (auth.uid() = sender or auth.uid() = recipient);

create policy "Users can send messages" on public.messages
  for insert with check (auth.uid() = sender);

-- Notifications policies
create policy "Users can view their notifications" on public.notifications
  for select using (auth.uid() = user_id);

-- AI jobs policies (admin only)
create policy "Owner can manage AI jobs" on public.ai_jobs
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and email = current_setting('app.owner_email', true)
    )
  );

-- User event stats policies
create policy "Users can view their own stats" on public.user_event_stats
  for select using (auth.uid() = user_id);

-- Triggers
create or replace function increment_connection_stats()
returns trigger as $$
begin
  -- Increment stats for both participants
  insert into public.user_event_stats (event_id, user_id, qr_connections, match_connections)
  values 
    (new.event_id, new.a, case when new.source = 'qr' then 1 else 0 end, case when new.source = 'match' then 1 else 0 end),
    (new.event_id, new.b, case when new.source = 'qr' then 1 else 0 end, case when new.source = 'match' then 1 else 0 end)
  on conflict (event_id, user_id) do update set
    qr_connections = user_event_stats.qr_connections + case when new.source = 'qr' then 1 else 0 end,
    match_connections = user_event_stats.match_connections + case when new.source = 'match' then 1 else 0 end;
  
  return new;
end;
$$ language plpgsql;

create trigger on_connection_insert
  after insert on public.connections
  for each row execute function increment_connection_stats();

-- Storage buckets
insert into storage.buckets (id, name, public) values 
('avatars', 'avatars', true),
('event-headers', 'event-headers', true),
('qr', 'qr', false);

-- Storage policies
create policy "Avatar images are publicly accessible" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "Event header images are publicly accessible" on storage.objects
  for select using (bucket_id = 'event-headers');

create policy "Users can upload their own avatars" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can update their own avatars" on storage.objects
  for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete their own avatars" on storage.objects
  for delete using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
