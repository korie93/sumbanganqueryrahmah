import "dotenv/config";
import pg from "pg";
import { withPostgresMigrationAdvisoryLock } from "./lib/postgres-migration-lock.mjs";

function readInt(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

const pool = new pg.Pool({
  host: process.env.PG_HOST ?? "localhost",
  port: readInt("PG_PORT", 5432),
  user: process.env.PG_USER ?? "postgres",
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE ?? "sqr_db",
});

const repairSql = `
UPDATE public.collection_daily_calendar_audit
SET
  old_leave_type = CASE
    WHEN upper(trim(COALESCE(old_leave_type, ''))) IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF')
      THEN upper(trim(old_leave_type))
    ELSE NULL
  END,
  new_leave_type = CASE
    WHEN upper(trim(COALESCE(new_leave_type, ''))) IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF')
      THEN upper(trim(new_leave_type))
    ELSE NULL
  END
WHERE (
    old_leave_type IS NOT NULL
    AND (
      old_leave_type <> upper(trim(old_leave_type))
      OR upper(trim(old_leave_type)) NOT IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF')
    )
  )
  OR (
    new_leave_type IS NOT NULL
    AND (
      new_leave_type <> upper(trim(new_leave_type))
      OR upper(trim(new_leave_type)) NOT IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF')
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_daily_calendar_audit_old_leave_type'
      AND conrelid = 'public.collection_daily_calendar_audit'::regclass
      AND (
        pg_get_constraintdef(oid) NOT LIKE '%RL%'
        OR pg_get_constraintdef(oid) NOT LIKE '%OFF%'
      )
  ) THEN
    ALTER TABLE public.collection_daily_calendar_audit
      DROP CONSTRAINT chk_collection_daily_calendar_audit_old_leave_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_daily_calendar_audit_old_leave_type'
      AND conrelid = 'public.collection_daily_calendar_audit'::regclass
  ) THEN
    ALTER TABLE public.collection_daily_calendar_audit
      ADD CONSTRAINT chk_collection_daily_calendar_audit_old_leave_type
      CHECK (old_leave_type IS NULL OR old_leave_type IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF'));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_daily_calendar_audit_new_leave_type'
      AND conrelid = 'public.collection_daily_calendar_audit'::regclass
      AND (
        pg_get_constraintdef(oid) NOT LIKE '%RL%'
        OR pg_get_constraintdef(oid) NOT LIKE '%OFF%'
      )
  ) THEN
    ALTER TABLE public.collection_daily_calendar_audit
      DROP CONSTRAINT chk_collection_daily_calendar_audit_new_leave_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_daily_calendar_audit_new_leave_type'
      AND conrelid = 'public.collection_daily_calendar_audit'::regclass
  ) THEN
    ALTER TABLE public.collection_daily_calendar_audit
      ADD CONSTRAINT chk_collection_daily_calendar_audit_new_leave_type
      CHECK (new_leave_type IS NULL OR new_leave_type IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF'));
  END IF;
END $$;
`;

const inspectSql = `
SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.collection_daily_calendar_audit'::regclass
  AND conname IN (
    'chk_collection_daily_calendar_audit_old_leave_type',
    'chk_collection_daily_calendar_audit_new_leave_type'
  )
ORDER BY conname ASC;
`;

try {
  await withPostgresMigrationAdvisoryLock(pool, async () => {
    await pool.query(repairSql);
  });

  const result = await pool.query(inspectSql);
  console.log("Collection daily calendar audit leave-type constraints repaired.");
  for (const row of result.rows) {
    console.log(`- ${row.conname}: ${row.definition}`);
  }
} catch (error) {
  console.error("Failed to repair collection daily calendar audit constraints:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
