-- ============================================================
-- ADD adaptive_qna_json COLUMN TO attendance TABLE
-- ============================================================
-- This column stores the transcript of adaptive Q&A questions
-- Format: { version: "v1", asked: [{ qid: string, choice: string }, ...] }

ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS adaptive_qna_json jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.attendance.adaptive_qna_json IS 'Transcript of adaptive Q&A questions and answers for this event. Format: { version: "v1", asked: [{ qid: string, choice: string }, ...] }';

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'attendance'
  AND column_name = 'adaptive_qna_json';

