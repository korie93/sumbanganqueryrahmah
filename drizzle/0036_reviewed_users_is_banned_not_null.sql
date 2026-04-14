ALTER TABLE public.users
ALTER COLUMN is_banned SET DEFAULT false;

UPDATE public.users
SET is_banned = false
WHERE is_banned IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE is_banned IS NULL
  ) THEN
    ALTER TABLE public.users
    ALTER COLUMN is_banned SET NOT NULL;
  END IF;
END
$$;
