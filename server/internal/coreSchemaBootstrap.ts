import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { logger } from "../lib/logger";

export class CoreSchemaBootstrap {
  private importsReady = false;
  private importsInitPromise: Promise<void> | null = null;
  private dataRowsReady = false;
  private dataRowsInitPromise: Promise<void> | null = null;
  private userActivityReady = false;
  private userActivityInitPromise: Promise<void> | null = null;
  private auditLogsReady = false;
  private auditLogsInitPromise: Promise<void> | null = null;
  private mutationIdempotencyReady = false;
  private mutationIdempotencyInitPromise: Promise<void> | null = null;
  private performanceIndexesReady = false;
  private performanceIndexesInitPromise: Promise<void> | null = null;
  private bannedSessionsReady = false;
  private bannedSessionsInitPromise: Promise<void> | null = null;

  async ensureImportsTable(): Promise<void> {
    if (this.importsReady) return;
    if (this.importsInitPromise) {
      await this.importsInitPromise;
      return;
    }

    this.importsInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.imports (
            id text PRIMARY KEY,
            name text NOT NULL,
            filename text NOT NULL,
            created_at timestamp DEFAULT now(),
            is_deleted boolean DEFAULT false,
            created_by text
          )
        `);
        await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS name text`);
        await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS filename text`);
        await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false`);
        await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS created_by text`);
        await db.execute(sql`
          UPDATE public.imports
          SET
            name = COALESCE(NULLIF(name, ''), NULLIF(filename, ''), 'Untitled Import'),
            filename = COALESCE(NULLIF(filename, ''), COALESCE(NULLIF(name, ''), 'unknown.csv')),
            created_at = COALESCE(created_at, now()),
            is_deleted = COALESCE(is_deleted, false)
        `);
        await db.execute(sql`ALTER TABLE public.imports ALTER COLUMN name SET NOT NULL`);
        await db.execute(sql`ALTER TABLE public.imports ALTER COLUMN filename SET NOT NULL`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_created_at ON public.imports(created_at DESC)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_is_deleted ON public.imports(is_deleted)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_created_by ON public.imports(created_by)`);
        this.importsReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure imports table", { error: err });
        throw err;
      }
    })();

    try {
      await this.importsInitPromise;
    } finally {
      this.importsInitPromise = null;
    }
  }

  async ensureDataRowsTable(): Promise<void> {
    if (this.dataRowsReady) return;
    if (this.dataRowsInitPromise) {
      await this.dataRowsInitPromise;
      return;
    }

    this.dataRowsInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.data_rows (
            id text PRIMARY KEY,
            import_id text NOT NULL,
            json_data jsonb NOT NULL DEFAULT '{}'::jsonb
          )
        `);
        await db.execute(sql`ALTER TABLE public.data_rows ADD COLUMN IF NOT EXISTS import_id text`);
        await db.execute(sql`ALTER TABLE public.data_rows ADD COLUMN IF NOT EXISTS json_data jsonb DEFAULT '{}'::jsonb`);
        await db.execute(sql`
          UPDATE public.data_rows
          SET json_data = COALESCE(json_data, '{}'::jsonb)
        `);
        await db.execute(sql`ALTER TABLE public.data_rows ALTER COLUMN import_id SET NOT NULL`);
        await db.execute(sql`ALTER TABLE public.data_rows ALTER COLUMN json_data SET NOT NULL`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_rows_import_id ON public.data_rows(import_id)`);
        this.dataRowsReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure data rows table", { error: err });
        throw err;
      }
    })();

    try {
      await this.dataRowsInitPromise;
    } finally {
      this.dataRowsInitPromise = null;
    }
  }

  async ensureUserActivityTable(): Promise<void> {
    if (this.userActivityReady) return;
    if (this.userActivityInitPromise) {
      await this.userActivityInitPromise;
      return;
    }

    this.userActivityInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.user_activity (
            id text PRIMARY KEY,
            user_id text NOT NULL,
            username text NOT NULL,
            role text NOT NULL,
            pc_name text,
            browser text,
            fingerprint text,
            ip_address text,
            login_time timestamp,
            logout_time timestamp,
            last_activity_time timestamp,
            is_active boolean DEFAULT true,
            logout_reason text
          )
        `);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS user_id text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS username text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS role text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS pc_name text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS browser text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS fingerprint text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS ip_address text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS login_time timestamp`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS logout_time timestamp`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS last_activity_time timestamp`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS logout_reason text`);
        await db.execute(sql`
          UPDATE public.user_activity
          SET
            is_active = COALESCE(is_active, true),
            login_time = COALESCE(login_time, now()),
            last_activity_time = COALESCE(last_activity_time, login_time, now())
        `);
        await db.execute(sql`
          DELETE FROM public.user_activity activity
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.users usr
            WHERE usr.id = activity.user_id
          )
        `);
        await db.execute(sql`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_constraint
              WHERE conname = 'fk_user_activity_user_id'
            ) THEN
              ALTER TABLE public.user_activity
              ADD CONSTRAINT fk_user_activity_user_id
              FOREIGN KEY (user_id)
              REFERENCES public.users(id)
              ON UPDATE CASCADE
              ON DELETE CASCADE;
            END IF;
          END $$;
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON public.user_activity(user_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_username ON public.user_activity(username)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_is_active ON public.user_activity(is_active)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_login_time ON public.user_activity(login_time DESC)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_last_activity_time ON public.user_activity(last_activity_time DESC)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_fingerprint ON public.user_activity(fingerprint)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_ip_address ON public.user_activity(ip_address)`);
        this.userActivityReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure user activity table", { error: err });
        throw err;
      }
    })();

    try {
      await this.userActivityInitPromise;
    } finally {
      this.userActivityInitPromise = null;
    }
  }

  async ensureAuditLogsTable(): Promise<void> {
    if (this.auditLogsReady) return;
    if (this.auditLogsInitPromise) {
      await this.auditLogsInitPromise;
      return;
    }

    this.auditLogsInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.audit_logs (
            id text PRIMARY KEY,
            action text NOT NULL,
            performed_by text NOT NULL,
            request_id text,
            target_user text,
            target_resource text,
            details text,
            timestamp timestamp DEFAULT now()
          )
        `);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action text`);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS performed_by text`);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS request_id text`);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_user text`);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_resource text`);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details text`);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS timestamp timestamp DEFAULT now()`);
        await db.execute(sql`
          UPDATE public.audit_logs
          SET timestamp = COALESCE(timestamp, now())
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs(performed_by)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON public.audit_logs(request_id)`);
        this.auditLogsReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure audit logs table", { error: err });
        throw err;
      }
    })();

    try {
      await this.auditLogsInitPromise;
    } finally {
      this.auditLogsInitPromise = null;
    }
  }

  async ensureMutationIdempotencyTable(): Promise<void> {
    if (this.mutationIdempotencyReady) return;
    if (this.mutationIdempotencyInitPromise) {
      await this.mutationIdempotencyInitPromise;
      return;
    }

    this.mutationIdempotencyInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.mutation_idempotency_keys (
            id uuid PRIMARY KEY,
            scope text NOT NULL,
            actor text NOT NULL,
            idempotency_key text NOT NULL,
            request_fingerprint text,
            state text NOT NULL DEFAULT 'pending',
            response_status integer,
            response_body jsonb,
            created_at timestamp DEFAULT now() NOT NULL,
            updated_at timestamp DEFAULT now() NOT NULL,
            completed_at timestamp
          )
        `);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS scope text`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS actor text`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS idempotency_key text`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS request_fingerprint text`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS state text DEFAULT 'pending'`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS response_status integer`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS response_body jsonb`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS completed_at timestamp`);
        await db.execute(sql`
          UPDATE public.mutation_idempotency_keys
          SET
            state = COALESCE(NULLIF(state, ''), 'pending'),
            created_at = COALESCE(created_at, now()),
            updated_at = COALESCE(updated_at, created_at, now())
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_mutation_idempotency_scope_actor_key_unique
          ON public.mutation_idempotency_keys(scope, actor, idempotency_key)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_mutation_idempotency_updated_at
          ON public.mutation_idempotency_keys(updated_at DESC)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_mutation_idempotency_state
          ON public.mutation_idempotency_keys(state)
        `);
        await db.execute(sql`
          DELETE FROM public.mutation_idempotency_keys
          WHERE (state = 'pending' AND updated_at < now() - interval '15 minutes')
             OR (state = 'completed' AND updated_at < now() - interval '1 day')
        `);
        this.mutationIdempotencyReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure mutation idempotency table", { error: err });
        throw err;
      }
    })();

    try {
      await this.mutationIdempotencyInitPromise;
    } finally {
      this.mutationIdempotencyInitPromise = null;
    }
  }

  async ensurePerformanceIndexes(): Promise<void> {
    if (this.performanceIndexesReady) return;
    if (this.performanceIndexesInitPromise) {
      await this.performanceIndexesInitPromise;
      return;
    }

    this.performanceIndexesInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_rows_import_id ON data_rows(import_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_is_deleted ON imports(is_deleted)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_login_time ON user_activity(login_time)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_logout_time ON user_activity(logout_time)`);

        try {
          await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_json_text_trgm
            ON data_rows
            USING GIN ((json_data::text) gin_trgm_ops)
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_mykad_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. MyKad',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_idno_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'ID No',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_nopengenalan_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No Pengenalan',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_ic_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'IC',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_cardno_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Card No',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_accountno_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Account No',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_accountnumber_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Account Number',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_akaunpemohon_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Nombor Akaun Bank Pemohon',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_noakaun_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No Akaun',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_telrumah_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. Telefon Rumah',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_telbimbit_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. Telefon Bimbit',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_phone_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Phone',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_handphone_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Handphone',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_officephone_digits
            ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'OfficePhone',''), '[^0-9]', '', 'g')))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_nob_trgm
            ON data_rows
            USING GIN (((json_data::jsonb)->>'NOB') gin_trgm_ops)
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_employer_name_trgm
            ON data_rows
            USING GIN (((json_data::jsonb)->>'EMPLOYER NAME') gin_trgm_ops)
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_nature_business_trgm
            ON data_rows
            USING GIN (((json_data::jsonb)->>'NATURE OF BUSINESS') gin_trgm_ops)
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_nama_trgm
            ON data_rows
            USING GIN (((json_data::jsonb)->>'Nama') gin_trgm_ops)
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_customer_name_trgm
            ON data_rows
            USING GIN (((json_data::jsonb)->>'Customer Name') gin_trgm_ops)
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_name_trgm
            ON data_rows
            USING GIN (((json_data::jsonb)->>'name') gin_trgm_ops)
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_mykad_exact
            ON data_rows (((json_data::jsonb)->>'No. MyKad'))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_idno_exact
            ON data_rows (((json_data::jsonb)->>'ID No'))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_nopengenalan_exact
            ON data_rows (((json_data::jsonb)->>'No Pengenalan'))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_ic_exact
            ON data_rows (((json_data::jsonb)->>'IC'))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_accountno_exact
            ON data_rows (((json_data::jsonb)->>'Account No'))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_accountnumber_exact
            ON data_rows (((json_data::jsonb)->>'Account Number'))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_cardno_exact
            ON data_rows (((json_data::jsonb)->>'Card No'))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_noakaun_exact
            ON data_rows (((json_data::jsonb)->>'No Akaun'))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_akaunpemohon_exact
            ON data_rows (((json_data::jsonb)->>'Nombor Akaun Bank Pemohon'))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_telrumah_exact
            ON data_rows (((json_data::jsonb)->>'No. Telefon Rumah'))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_telbimbit_exact
            ON data_rows (((json_data::jsonb)->>'No. Telefon Bimbit'))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_phone_exact
            ON data_rows (((json_data::jsonb)->>'Phone'))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_handphone_exact
            ON data_rows (((json_data::jsonb)->>'Handphone'))
          `);
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_rows_officephone_exact
            ON data_rows (((json_data::jsonb)->>'OfficePhone'))
          `);
        } catch (err: any) {
          logger.warn("pg_trgm is not available; skipping trigram index creation", { error: err });
        }

        this.performanceIndexesReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure performance indexes", { error: err });
      }
    })();

    try {
      await this.performanceIndexesInitPromise;
    } finally {
      this.performanceIndexesInitPromise = null;
    }
  }

  async ensureBannedSessionsTable(): Promise<void> {
    if (this.bannedSessionsReady) return;
    if (this.bannedSessionsInitPromise) {
      await this.bannedSessionsInitPromise;
      return;
    }

    this.bannedSessionsInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
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
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_banned_sessions_fingerprint ON public.banned_sessions(fingerprint)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_banned_sessions_ip ON public.banned_sessions(ip_address)`);
        this.bannedSessionsReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure banned sessions table", { error: err });
      }
    })();

    try {
      await this.bannedSessionsInitPromise;
    } finally {
      this.bannedSessionsInitPromise = null;
    }
  }
}
