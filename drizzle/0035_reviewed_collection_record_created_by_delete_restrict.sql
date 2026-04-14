DO $$
DECLARE
  current_delete_rule text;
  current_update_rule text;
BEGIN
  SELECT
    rc.delete_rule,
    rc.update_rule
  INTO current_delete_rule, current_update_rule
  FROM information_schema.referential_constraints rc
  WHERE rc.constraint_schema = 'public'
    AND rc.constraint_name = 'fk_collection_records_created_by_login_username';

  IF current_delete_rule IS DISTINCT FROM 'RESTRICT'
    OR current_update_rule IS DISTINCT FROM 'CASCADE' THEN
    ALTER TABLE public.collection_records
    DROP CONSTRAINT IF EXISTS fk_collection_records_created_by_login_username;

    ALTER TABLE public.collection_records
    ADD CONSTRAINT fk_collection_records_created_by_login_username
    FOREIGN KEY (created_by_login)
    REFERENCES public.users(username)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;
  END IF;
END $$;
