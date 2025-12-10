-- ============================================================
-- MIGRATION: Add email notifications
-- ============================================================
-- Adds email_notifications_enabled column to users table
-- for email notification functionality

-- Add email_notifications_enabled column (boolean, default true)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.users.email_notifications_enabled IS 'Whether email notifications are enabled for this user';

