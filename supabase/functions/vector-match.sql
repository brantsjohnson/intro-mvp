-- ============================================================
-- Helper functions for ANN candidate recall
-- ============================================================

create or replace function public.match_offer_candidates(
  match_event_id uuid,
  query_embedding vector(1536),
  match_count int default 100,
  exclude_user_id uuid default null
)
returns table(
  user_id uuid,
  similarity double precision
)
language sql
stable
as $$
  select
    u.user_id,
    1 - (u.offer_embedding <=> query_embedding) as similarity
  from public.users u
  join public.attendance a
    on a.user_id = u.user_id
  where a.event_id = match_event_id
    and u.offer_embedding is not null
    and (exclude_user_id is null or u.user_id <> exclude_user_id)
  order by u.offer_embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_need_candidates(
  match_event_id uuid,
  query_embedding vector(1536),
  match_count int default 100,
  exclude_user_id uuid default null
)
returns table(
  user_id uuid,
  similarity double precision
)
language sql
stable
as $$
  select
    u.user_id,
    1 - (u.need_embedding <=> query_embedding) as similarity
  from public.users u
  join public.attendance a
    on a.user_id = u.user_id
  where a.event_id = match_event_id
    and u.need_embedding is not null
    and (exclude_user_id is null or u.user_id <> exclude_user_id)
  order by u.need_embedding <=> query_embedding
  limit match_count;
$$;

