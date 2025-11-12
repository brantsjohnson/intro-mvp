-- ============================================================
-- ADD pgvector INDEXES FOR VECTOR SIMILARITY SEARCH
-- ============================================================
-- This migration enables pgvector extension and creates HNSW indexes
-- for efficient vector similarity search on embeddings columns

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create HNSW indexes for vector similarity search on users table
-- These indexes enable fast cosine similarity search using the <=> operator
CREATE INDEX IF NOT EXISTS users_offer_embedding_idx 
  ON public.users 
  USING hnsw (offer_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS users_want_embedding_idx 
  ON public.users 
  USING hnsw (want_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS users_need_embedding_idx
  ON public.users
  USING hnsw (need_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS users_personality_embedding_idx
  ON public.users
  USING hnsw (personality_embedding vector_cosine_ops);

-- Create HNSW index for event_profile_embedding on attendance table
CREATE INDEX IF NOT EXISTS attendance_event_profile_embedding_idx 
  ON public.attendance 
  USING hnsw (event_profile_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS attendance_profile_embedding_idx
  ON public.attendance
  USING hnsw (profile_embedding vector_cosine_ops);

-- Add indexes for fast lookups (composite indexes for common queries)
CREATE INDEX IF NOT EXISTS attendance_event_user_idx 
  ON public.attendance (event_id, user_id);

CREATE INDEX IF NOT EXISTS connections_event_a_idx 
  ON public.connections (event_id, a_id);

CREATE INDEX IF NOT EXISTS connections_event_b_idx 
  ON public.connections (event_id, b_id);

-- Add index for connection_kind lookups (for filtering system matches)
CREATE INDEX IF NOT EXISTS connections_event_kind_idx 
  ON public.connections (event_id, connection_kind);

-- Verify indexes were created
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname LIKE '%embedding%' OR
    indexname LIKE '%attendance_event_user%' OR
    indexname LIKE '%connections_event%'
  )
ORDER BY tablename, indexname;

-- Success message
SELECT 'pgvector indexes created successfully!' as result;

