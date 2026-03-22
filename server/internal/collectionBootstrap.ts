import { randomUUID } from "crypto";
import path from "path";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { logger } from "../lib/logger";

function inferMimeTypeFromReceiptPath(receiptPath: string): string {
  const extension = path.extname(String(receiptPath || "").trim()).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

export class CollectionBootstrap {
  private recordsReady = false;
  private recordsInitPromise: Promise<void> | null = null;
  private staffNicknamesReady = false;
  private staffNicknamesInitPromise: Promise<void> | null = null;
  private adminGroupsReady = false;
  private adminGroupsInitPromise: Promise<void> | null = null;
  private nicknameSessionsReady = false;
  private nicknameSessionsInitPromise: Promise<void> | null = null;
  private adminVisibleNicknamesReady = false;
  private adminVisibleNicknamesInitPromise: Promise<void> | null = null;
  private dailyTablesReady = false;
  private dailyTablesInitPromise: Promise<void> | null = null;

  async ensureRecordsTable(): Promise<void> {
    if (this.recordsReady) return;
    if (this.recordsInitPromise) {
      await this.recordsInitPromise;
      return;
    }

    this.recordsInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.collection_records (
            id uuid PRIMARY KEY,
            customer_name text NOT NULL,
            ic_number text NOT NULL,
            customer_phone text NOT NULL,
            account_number text NOT NULL,
            batch text NOT NULL,
            payment_date date NOT NULL,
            amount numeric(14,2) NOT NULL,
            receipt_file text,
            created_by_login text NOT NULL,
            collection_staff_nickname text NOT NULL,
            staff_username text NOT NULL,
            created_at timestamp DEFAULT now() NOT NULL,
            updated_at timestamp DEFAULT now() NOT NULL
          )
        `);
        await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name text`);
        await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS ic_number text`);
        await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_phone text`);
        await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS account_number text`);
        await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS batch text`);
        await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS payment_date date`);
        await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS amount numeric(14,2)`);
        await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_file text`);
        await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_by_login text`);
        await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS collection_staff_nickname text`);
        await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS staff_username text`);
        await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
        await db.execute(sql`
          UPDATE public.collection_records
          SET customer_phone = COALESCE(NULLIF(customer_phone, ''), '-')
        `);
        await db.execute(sql`
          UPDATE public.collection_records
          SET created_by_login = COALESCE(NULLIF(created_by_login, ''), NULLIF(staff_username, ''), 'unknown')
        `);
        await db.execute(sql`
          UPDATE public.collection_records
          SET collection_staff_nickname = COALESCE(NULLIF(collection_staff_nickname, ''), NULLIF(staff_username, ''), NULLIF(created_by_login, ''), 'unknown')
        `);
        await db.execute(sql`
          UPDATE public.collection_records
          SET staff_username = COALESCE(NULLIF(staff_username, ''), NULLIF(collection_staff_nickname, ''), NULLIF(created_by_login, ''), 'unknown')
        `);
        await db.execute(sql`
          UPDATE public.collection_records
          SET updated_at = COALESCE(updated_at, created_at, now())
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_payment_date ON public.collection_records(payment_date)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_created_at ON public.collection_records(created_at DESC)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_username ON public.collection_records(staff_username)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_created_by_login ON public.collection_records(created_by_login)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_nickname ON public.collection_records(collection_staff_nickname)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_customer_phone ON public.collection_records(customer_phone)`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.collection_record_receipts (
            id uuid PRIMARY KEY,
            collection_record_id uuid NOT NULL,
            storage_path text NOT NULL,
            original_file_name text NOT NULL,
            original_mime_type text NOT NULL,
            original_extension text NOT NULL DEFAULT '',
            file_size bigint NOT NULL DEFAULT 0,
            created_at timestamp NOT NULL DEFAULT now()
          )
        `);
        await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS collection_record_id uuid`);
        await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS storage_path text`);
        await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_file_name text`);
        await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_mime_type text`);
        await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_extension text DEFAULT ''`);
        await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS file_size bigint DEFAULT 0`);
        await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`
          UPDATE public.collection_record_receipts
          SET
            original_file_name = COALESCE(NULLIF(trim(COALESCE(original_file_name, '')), ''), 'receipt'),
            original_mime_type = COALESCE(NULLIF(trim(COALESCE(original_mime_type, '')), ''), 'application/octet-stream'),
            original_extension = COALESCE(NULLIF(trim(COALESCE(original_extension, '')), ''), ''),
            file_size = COALESCE(file_size, 0),
            created_at = COALESCE(created_at, now())
        `);
        await db.execute(sql`DELETE FROM public.collection_record_receipts WHERE collection_record_id IS NULL OR trim(COALESCE(storage_path, '')) = ''`);
        await db.execute(sql`
          DELETE FROM public.collection_record_receipts receipt
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.collection_records record
            WHERE record.id = receipt.collection_record_id
          )
        `);
        await db.execute(sql`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_constraint
              WHERE conname = 'fk_collection_record_receipts_record_id'
            ) THEN
              ALTER TABLE public.collection_record_receipts
              ADD CONSTRAINT fk_collection_record_receipts_record_id
              FOREIGN KEY (collection_record_id)
              REFERENCES public.collection_records(id)
              ON UPDATE CASCADE
              ON DELETE CASCADE;
            END IF;
          END $$;
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_receipts_record_storage_unique
          ON public.collection_record_receipts (collection_record_id, storage_path)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_collection_record_receipts_record_created_at
          ON public.collection_record_receipts (collection_record_id, created_at ASC)
        `);

        const legacyReceiptRows = await db.execute(sql`
          SELECT
            id,
            receipt_file,
            created_at
          FROM public.collection_records cr
          WHERE trim(COALESCE(cr.receipt_file, '')) <> ''
            AND NOT EXISTS (
              SELECT 1
              FROM public.collection_record_receipts crr
              WHERE crr.collection_record_id = cr.id
                AND crr.storage_path = cr.receipt_file
            )
          LIMIT 10000
        `);

        for (const row of legacyReceiptRows.rows as Array<{ id?: string; receipt_file?: string; created_at?: Date | string }>) {
          const collectionRecordId = String(row.id || "").trim();
          const storagePath = String(row.receipt_file || "").trim();
          if (!collectionRecordId || !storagePath) continue;
          const fileName = path.basename(storagePath);
          const createdAt = row.created_at ? new Date(row.created_at) : new Date();
          const extension = path.extname(fileName).toLowerCase();
          await db.execute(sql`
            INSERT INTO public.collection_record_receipts (
              id,
              collection_record_id,
              storage_path,
              original_file_name,
              original_mime_type,
              original_extension,
              file_size,
              created_at
            )
            VALUES (
              ${randomUUID()}::uuid,
              ${collectionRecordId}::uuid,
              ${storagePath},
              ${fileName || "receipt"},
              ${inferMimeTypeFromReceiptPath(storagePath)},
              ${extension},
              0,
              ${createdAt}
            )
            ON CONFLICT (collection_record_id, storage_path) DO NOTHING
          `);
        }
        this.recordsReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure collection records table", { error: err });
        throw err;
      }
    })();

    try {
      await this.recordsInitPromise;
    } finally {
      this.recordsInitPromise = null;
    }
  }

  async ensureStaffNicknamesTable(): Promise<void> {
    if (this.staffNicknamesReady) return;
    if (this.staffNicknamesInitPromise) {
      await this.staffNicknamesInitPromise;
      return;
    }

    this.staffNicknamesInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.collection_staff_nicknames (
            id uuid PRIMARY KEY,
            nickname text NOT NULL,
            is_active boolean NOT NULL DEFAULT true,
            role_scope text NOT NULL DEFAULT 'both',
            nickname_password_hash text,
            must_change_password boolean NOT NULL DEFAULT true,
            password_reset_by_superuser boolean NOT NULL DEFAULT false,
            password_updated_at timestamp,
            created_by text,
            created_at timestamp NOT NULL DEFAULT now()
          )
        `);
        await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS nickname text`);
        await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`);
        await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS role_scope text DEFAULT 'both'`);
        await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS nickname_password_hash text`);
        await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT true`);
        await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS password_reset_by_superuser boolean DEFAULT false`);
        await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS password_updated_at timestamp`);
        await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS created_by text`);
        await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`
          UPDATE public.collection_staff_nicknames
          SET
            nickname = trim(COALESCE(nickname, '')),
            is_active = COALESCE(is_active, true),
            role_scope = CASE
              WHEN lower(trim(COALESCE(role_scope, ''))) IN ('admin', 'user', 'both')
                THEN lower(trim(COALESCE(role_scope, '')))
              ELSE 'both'
            END,
            nickname_password_hash = NULLIF(trim(COALESCE(nickname_password_hash, '')), ''),
            must_change_password = COALESCE(
              must_change_password,
              CASE
                WHEN NULLIF(trim(COALESCE(nickname_password_hash, '')), '') IS NULL THEN true
                ELSE false
              END
            ),
            password_reset_by_superuser = COALESCE(password_reset_by_superuser, false),
            created_at = COALESCE(created_at, now())
        `);
        await db.execute(sql`DELETE FROM public.collection_staff_nicknames WHERE nickname = ''`);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_staff_nicknames_lower_unique ON public.collection_staff_nicknames(lower(nickname))`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_active ON public.collection_staff_nicknames(is_active)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_role_scope ON public.collection_staff_nicknames(role_scope)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_must_change_password ON public.collection_staff_nicknames(must_change_password)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_password_reset ON public.collection_staff_nicknames(password_reset_by_superuser)`);

        const seedRows = await db.execute(sql`
          SELECT DISTINCT trim(collection_staff_nickname) AS nickname
          FROM public.collection_records
          WHERE collection_staff_nickname IS NOT NULL
            AND trim(collection_staff_nickname) <> ''
          LIMIT 5000
        `);
        for (const row of seedRows.rows as Array<{ nickname?: string }>) {
          const nickname = String(row.nickname || "").trim();
          if (!nickname) continue;
          await db.execute(sql`
            INSERT INTO public.collection_staff_nicknames (
              id,
              nickname,
              is_active,
              nickname_password_hash,
              must_change_password,
              password_reset_by_superuser,
              password_updated_at,
              created_by,
              created_at
            )
            VALUES (
              ${randomUUID()}::uuid,
              ${nickname},
              true,
              NULL,
              true,
              false,
              NULL,
              'system-seed',
              now()
            )
            ON CONFLICT ((lower(nickname))) DO NOTHING
          `);
        }

        this.staffNicknamesReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure collection staff nicknames table", { error: err });
        throw err;
      }
    })();

    try {
      await this.staffNicknamesInitPromise;
    } finally {
      this.staffNicknamesInitPromise = null;
    }
  }

  async ensureAdminGroupsTables(): Promise<void> {
    if (this.adminGroupsReady) return;
    if (this.adminGroupsInitPromise) {
      await this.adminGroupsInitPromise;
      return;
    }

    this.adminGroupsInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.admin_groups (
            id uuid PRIMARY KEY,
            leader_nickname text NOT NULL,
            created_by text NOT NULL,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now()
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.admin_group_members (
            id uuid PRIMARY KEY,
            admin_group_id uuid NOT NULL,
            member_nickname text NOT NULL,
            created_at timestamp NOT NULL DEFAULT now()
          )
        `);

        await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS leader_nickname text`);
        await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_by text`);
        await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);

        await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS admin_group_id uuid`);
        await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS member_nickname text`);
        await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);

        await db.execute(sql`
          UPDATE public.admin_groups
          SET
            leader_nickname = trim(COALESCE(leader_nickname, '')),
            created_by = COALESCE(NULLIF(trim(COALESCE(created_by, '')), ''), 'system-seed'),
            created_at = COALESCE(created_at, now()),
            updated_at = COALESCE(updated_at, now())
        `);
        await db.execute(sql`DELETE FROM public.admin_groups WHERE trim(COALESCE(leader_nickname, '')) = ''`);

        await db.execute(sql`
          UPDATE public.admin_group_members
          SET
            member_nickname = trim(COALESCE(member_nickname, '')),
            created_at = COALESCE(created_at, now())
        `);
        await db.execute(sql`DELETE FROM public.admin_group_members WHERE trim(COALESCE(member_nickname, '')) = ''`);
        await db.execute(sql`
          DELETE FROM public.admin_group_members m
          WHERE m.admin_group_id IS NULL
             OR NOT EXISTS (
              SELECT 1
              FROM public.admin_groups g
              WHERE g.id = m.admin_group_id
            )
        `);

        await db.execute(sql`
          DELETE FROM public.admin_group_members m
          USING public.admin_groups g
          WHERE g.id = m.admin_group_id
            AND lower(g.leader_nickname) = lower(m.member_nickname)
        `);

        await db.execute(sql`
          DELETE FROM public.admin_groups a
          USING public.admin_groups b
          WHERE lower(a.leader_nickname) = lower(b.leader_nickname)
            AND a.ctid > b.ctid
        `);

        await db.execute(sql`
          DELETE FROM public.admin_group_members a
          USING public.admin_group_members b
          WHERE a.admin_group_id = b.admin_group_id
            AND lower(a.member_nickname) = lower(b.member_nickname)
            AND a.ctid > b.ctid
        `);

        await db.execute(sql`
          DELETE FROM public.admin_group_members a
          USING public.admin_group_members b
          WHERE lower(a.member_nickname) = lower(b.member_nickname)
            AND a.ctid > b.ctid
        `);

        await db.execute(sql`
          DELETE FROM public.admin_group_members m
          WHERE EXISTS (
            SELECT 1
            FROM public.admin_groups g
            WHERE lower(g.leader_nickname) = lower(m.member_nickname)
              AND g.id <> m.admin_group_id
          )
        `);

        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_groups_leader_nickname_unique
          ON public.admin_groups (lower(leader_nickname))
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_group_member_unique
          ON public.admin_group_members (admin_group_id, lower(member_nickname))
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_member_unique
          ON public.admin_group_members (lower(member_nickname))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_admin_group_members_group
          ON public.admin_group_members (admin_group_id)
        `);

        this.adminGroupsReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure admin group tables", { error: err });
        throw err;
      }
    })();

    try {
      await this.adminGroupsInitPromise;
    } finally {
      this.adminGroupsInitPromise = null;
    }
  }

  async ensureNicknameSessionsTable(): Promise<void> {
    if (this.nicknameSessionsReady) return;
    if (this.nicknameSessionsInitPromise) {
      await this.nicknameSessionsInitPromise;
      return;
    }

    this.nicknameSessionsInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.collection_nickname_sessions (
            activity_id text PRIMARY KEY,
            username text NOT NULL,
            user_role text NOT NULL,
            nickname text NOT NULL,
            verified_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now()
          )
        `);
        await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS username text`);
        await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS user_role text`);
        await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS nickname text`);
        await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS verified_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
        await db.execute(sql`
          UPDATE public.collection_nickname_sessions
          SET
            username = trim(COALESCE(username, '')),
            user_role = trim(COALESCE(user_role, '')),
            nickname = trim(COALESCE(nickname, '')),
            verified_at = COALESCE(verified_at, now()),
            updated_at = COALESCE(updated_at, now())
        `);
        await db.execute(sql`
          DELETE FROM public.collection_nickname_sessions
          WHERE trim(COALESCE(username, '')) = ''
            OR trim(COALESCE(user_role, '')) = ''
            OR trim(COALESCE(nickname, '')) = ''
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_username
          ON public.collection_nickname_sessions (username)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_nickname
          ON public.collection_nickname_sessions (lower(nickname))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_updated_at
          ON public.collection_nickname_sessions (updated_at DESC)
        `);

        this.nicknameSessionsReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure collection nickname session table", { error: err });
        throw err;
      }
    })();

    try {
      await this.nicknameSessionsInitPromise;
    } finally {
      this.nicknameSessionsInitPromise = null;
    }
  }

  async ensureAdminVisibleNicknamesTable(): Promise<void> {
    if (this.adminVisibleNicknamesReady) return;
    if (this.adminVisibleNicknamesInitPromise) {
      await this.adminVisibleNicknamesInitPromise;
      return;
    }

    this.adminVisibleNicknamesInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.admin_visible_nicknames (
            id uuid PRIMARY KEY,
            admin_user_id text NOT NULL,
            nickname_id uuid NOT NULL,
            created_by_superuser text,
            created_at timestamp NOT NULL DEFAULT now()
          )
        `);
        await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS admin_user_id text`);
        await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS nickname_id uuid`);
        await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS created_by_superuser text`);
        await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`
          UPDATE public.admin_visible_nicknames
          SET created_at = COALESCE(created_at, now())
        `);
        await db.execute(sql`
          DELETE FROM public.admin_visible_nicknames avn
          WHERE avn.admin_user_id IS NULL
            OR avn.nickname_id IS NULL
        `);
        await db.execute(sql`
          DELETE FROM public.admin_visible_nicknames avn
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.users u
            WHERE u.id = avn.admin_user_id
              AND u.role = 'admin'
          )
        `);
        await db.execute(sql`
          DELETE FROM public.admin_visible_nicknames avn
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.collection_staff_nicknames c
            WHERE c.id = avn.nickname_id
          )
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_visible_nicknames_admin_nickname_unique
          ON public.admin_visible_nicknames(admin_user_id, nickname_id)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_admin_visible_nicknames_admin
          ON public.admin_visible_nicknames(admin_user_id)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_admin_visible_nicknames_nickname
          ON public.admin_visible_nicknames(nickname_id)
        `);

        const existingCount = await db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM public.admin_visible_nicknames
          LIMIT 1
        `);
        const total = Number(existingCount.rows?.[0]?.total ?? 0);
        if (total === 0) {
          const admins = await db.execute(sql`
            SELECT id
            FROM public.users
            WHERE role = 'admin'
            ORDER BY username ASC
            LIMIT 5000
          `);
          const nicknames = await db.execute(sql`
            SELECT id
            FROM public.collection_staff_nicknames
            WHERE is_active = true
            ORDER BY lower(nickname) ASC
            LIMIT 5000
          `);

          const adminIds = (admins.rows || [])
            .map((row: any) => String(row.id || "").trim())
            .filter(Boolean);
          const nicknameIds = (nicknames.rows || [])
            .map((row: any) => String(row.id || "").trim())
            .filter(Boolean);

          for (const adminUserId of adminIds) {
            for (const nicknameId of nicknameIds) {
              await db.execute(sql`
                INSERT INTO public.admin_visible_nicknames (
                  id,
                  admin_user_id,
                  nickname_id,
                  created_by_superuser,
                  created_at
                )
                VALUES (
                  ${randomUUID()}::uuid,
                  ${adminUserId},
                  ${nicknameId}::uuid,
                  'system-seed',
                  now()
                )
                ON CONFLICT (admin_user_id, nickname_id) DO NOTHING
              `);
            }
          }
        }

        this.adminVisibleNicknamesReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure admin visible nicknames table", { error: err });
        throw err;
      }
    })();

    try {
      await this.adminVisibleNicknamesInitPromise;
    } finally {
      this.adminVisibleNicknamesInitPromise = null;
    }
  }

  async ensureDailyTables(): Promise<void> {
    if (this.dailyTablesReady) return;
    if (this.dailyTablesInitPromise) {
      await this.dailyTablesInitPromise;
      return;
    }

    this.dailyTablesInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.collection_daily_targets (
            id uuid PRIMARY KEY,
            username text NOT NULL,
            year integer NOT NULL,
            month integer NOT NULL,
            monthly_target numeric(14,2) NOT NULL DEFAULT 0,
            created_by text,
            updated_by text,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now()
          )
        `);
        await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS username text`);
        await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS year integer`);
        await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS month integer`);
        await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS monthly_target numeric(14,2) DEFAULT 0`);
        await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS created_by text`);
        await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS updated_by text`);
        await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
        await db.execute(sql`
          UPDATE public.collection_daily_targets
          SET
            username = lower(trim(COALESCE(username, ''))),
            monthly_target = COALESCE(monthly_target, 0),
            created_at = COALESCE(created_at, now()),
            updated_at = COALESCE(updated_at, now())
        `);
        await db.execute(sql`DELETE FROM public.collection_daily_targets WHERE trim(COALESCE(username, '')) = ''`);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_targets_user_month_unique
          ON public.collection_daily_targets (lower(username), year, month)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_collection_daily_targets_year_month
          ON public.collection_daily_targets (year, month)
        `);

        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.collection_daily_calendar (
            id uuid PRIMARY KEY,
            year integer NOT NULL,
            month integer NOT NULL,
            day integer NOT NULL,
            is_working_day boolean NOT NULL DEFAULT true,
            is_holiday boolean NOT NULL DEFAULT false,
            holiday_name text,
            created_by text,
            updated_by text,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now()
          )
        `);
        await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS year integer`);
        await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS month integer`);
        await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS day integer`);
        await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS is_working_day boolean DEFAULT true`);
        await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS is_holiday boolean DEFAULT false`);
        await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS holiday_name text`);
        await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS created_by text`);
        await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS updated_by text`);
        await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
        await db.execute(sql`
          UPDATE public.collection_daily_calendar
          SET
            is_working_day = COALESCE(is_working_day, true),
            is_holiday = COALESCE(is_holiday, false),
            created_at = COALESCE(created_at, now()),
            updated_at = COALESCE(updated_at, now())
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_calendar_unique
          ON public.collection_daily_calendar (year, month, day)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_collection_daily_calendar_year_month
          ON public.collection_daily_calendar (year, month)
        `);

        this.dailyTablesReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure collection daily tables", { error: err });
        throw err;
      }
    })();

    try {
      await this.dailyTablesInitPromise;
    } finally {
      this.dailyTablesInitPromise = null;
    }
  }
}
