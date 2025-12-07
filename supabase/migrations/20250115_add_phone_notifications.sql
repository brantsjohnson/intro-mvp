-- ============================================================
-- MIGRATION: Add phone number and SMS notifications
-- ============================================================
-- Adds phone_number and sms_notifications_enabled columns to users table
-- for SMS notification functionality

-- Add phone_number column (nullable text field)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Add sms_notifications_enabled column (boolean, default true)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS sms_notifications_enabled BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.users.phone_number IS 'User phone number for SMS notifications';
COMMENT ON COLUMN public.users.sms_notifications_enabled IS 'Whether SMS notifications are enabled for this user';


