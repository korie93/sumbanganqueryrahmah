CREATE TABLE IF NOT EXISTS public.banned_sessions (
  id text PRIMARY KEY,
  username text NOT NULL,
  role text NOT NULL,
  activity_id text NOT NULL,
  fingerprint text,
  ip_address text,
  browser text,
  pc_name text,
  banned_at timestamp DEFAULT now()
);

ALTER TABLE public.banned_sessions ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.banned_sessions ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.banned_sessions ADD COLUMN IF NOT EXISTS activity_id text;
ALTER TABLE public.banned_sessions ADD COLUMN IF NOT EXISTS fingerprint text;
ALTER TABLE public.banned_sessions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.banned_sessions ADD COLUMN IF NOT EXISTS browser text;
ALTER TABLE public.banned_sessions ADD COLUMN IF NOT EXISTS pc_name text;
ALTER TABLE public.banned_sessions ADD COLUMN IF NOT EXISTS banned_at timestamp DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_banned_sessions_fingerprint
ON public.banned_sessions (fingerprint);

CREATE INDEX IF NOT EXISTS idx_banned_sessions_ip
ON public.banned_sessions (ip_address);
