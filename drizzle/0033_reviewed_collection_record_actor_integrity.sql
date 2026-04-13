UPDATE public.collection_records
SET
  created_by_login = COALESCE(NULLIF(trim(COALESCE(created_by_login, '')), ''), 'unknown'),
  collection_staff_nickname = COALESCE(
    NULLIF(trim(COALESCE(collection_staff_nickname, '')), ''),
    NULLIF(trim(COALESCE(staff_username, '')), ''),
    'unknown'
  );

UPDATE public.collection_records
SET staff_username = collection_staff_nickname;

UPDATE public.collection_records record
SET created_by_login = usr.username
FROM public.users usr
WHERE lower(usr.username) = lower(record.created_by_login);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_records_staff_username_matches_nickname'
  ) THEN
    ALTER TABLE public.collection_records
    ADD CONSTRAINT chk_collection_records_staff_username_matches_nickname
    CHECK (lower(staff_username) = lower(collection_staff_nickname));
  END IF;
END $$;
