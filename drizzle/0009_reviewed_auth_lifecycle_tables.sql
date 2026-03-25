CREATE TABLE IF NOT EXISTS public.account_activation_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  created_by text,
  created_at timestamp DEFAULT now()
);

ALTER TABLE public.account_activation_tokens ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.account_activation_tokens ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();

UPDATE public.account_activation_tokens
SET created_at = COALESCE(created_at, now());

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_activation_tokens_hash_unique
ON public.account_activation_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_account_activation_tokens_user_id
ON public.account_activation_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_account_activation_tokens_expires_at
ON public.account_activation_tokens(expires_at);

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  requested_by_user text,
  approved_by text,
  reset_type text NOT NULL DEFAULT 'email_link',
  token_hash text,
  expires_at timestamp,
  used_at timestamp,
  created_at timestamp DEFAULT now()
);

ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS requested_by_user text;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS reset_type text DEFAULT 'email_link';
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS expires_at timestamp;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS used_at timestamp;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
ALTER TABLE public.password_reset_requests ALTER COLUMN reset_type SET DEFAULT 'email_link';

UPDATE public.password_reset_requests
SET
  reset_type = COALESCE(NULLIF(trim(COALESCE(reset_type, '')), ''), 'email_link'),
  created_at = COALESCE(created_at, now());

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_id
ON public.password_reset_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_created_at
ON public.password_reset_requests(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_requests_token_hash_unique
ON public.password_reset_requests(token_hash)
WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_expires_at
ON public.password_reset_requests(expires_at)
WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_pending_review
ON public.password_reset_requests(user_id, created_at DESC)
WHERE approved_by IS NULL AND used_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'users'
  ) THEN
    DELETE FROM public.account_activation_tokens token
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.users usr
      WHERE usr.id = token.user_id
    );

    DELETE FROM public.password_reset_requests req
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.users usr
      WHERE usr.id = req.user_id
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_account_activation_tokens_user_id'
    ) THEN
      ALTER TABLE public.account_activation_tokens
      ADD CONSTRAINT fk_account_activation_tokens_user_id
      FOREIGN KEY (user_id)
      REFERENCES public.users(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_password_reset_requests_user_id'
    ) THEN
      ALTER TABLE public.password_reset_requests
      ADD CONSTRAINT fk_password_reset_requests_user_id
      FOREIGN KEY (user_id)
      REFERENCES public.users(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE;
    END IF;
  END IF;
END
$$;
