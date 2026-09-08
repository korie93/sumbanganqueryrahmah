-- Terminal account deletion preserves historical usernames/stable owners and
-- prevents revival through stale updates, bootstrap or new authentication state.
CREATE OR REPLACE FUNCTION public.enforce_deleted_account_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'deleted' AND (
    NEW.status IS DISTINCT FROM 'deleted'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.username IS DISTINCT FROM OLD.username
    OR NEW.role IS DISTINCT FROM OLD.role
  ) THEN
    RAISE EXCEPTION 'Deleted account identity cannot be restored or reassigned' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'deleted' THEN
    NEW.password_hash := '!deleted-account!';
    NEW.email := NULL;
    NEW.is_banned := true;
    NEW.must_change_password := false;
    NEW.password_reset_by_superuser := false;
    NEW.two_factor_enabled := false;
    NEW.two_factor_secret_encrypted := NULL;
    NEW.two_factor_configured_at := NULL;
    NEW.failed_login_attempts := 0;
    NEW.locked_at := NULL;
    NEW.locked_reason := NULL;
    NEW.locked_by_system := false;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_deleted_identity_guard ON public.users;
CREATE TRIGGER users_deleted_identity_guard BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_deleted_account_identity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_deleted_account_auth_state() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE account_status text;
BEGIN
  IF TG_TABLE_NAME = 'user_activity' THEN
    IF NEW.is_active IS DISTINCT FROM true THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.is_active = true AND OLD.user_id = NEW.user_id THEN RETURN NEW; END IF;
  END IF;
  SELECT status INTO account_status FROM public.users WHERE id = NEW.user_id FOR SHARE;
  IF account_status = 'deleted' THEN
    RAISE EXCEPTION 'Deleted accounts cannot receive authentication state' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['user_activity', 'account_activation_tokens', 'password_reset_requests'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS deleted_account_auth_guard ON public.%I', table_name);
      EXECUTE format('CREATE TRIGGER deleted_account_auth_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_deleted_account_auth_state()', table_name);
    END IF;
  END LOOP;
END $$;
