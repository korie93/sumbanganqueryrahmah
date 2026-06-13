ALTER TABLE public.user_activity
ADD COLUMN IF NOT EXISTS device_type text;

ALTER TABLE public.user_activity
ADD COLUMN IF NOT EXISTS platform text;

ALTER TABLE public.banned_sessions
ADD COLUMN IF NOT EXISTS device_type text;

ALTER TABLE public.banned_sessions
ADD COLUMN IF NOT EXISTS platform text;
