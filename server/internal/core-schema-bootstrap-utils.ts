import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { logger } from "../lib/logger";

export type CoreSchemaSqlExecutor = Pick<typeof db, "execute">;
export type CoreSchemaBootstrapTaskState = {
  ready: boolean;
  initPromise: Promise<void> | null;
};

type CoreSchemaTaskRunnerOptions = {
  errorMessage: string;
  database?: CoreSchemaSqlExecutor;
  rethrowError?: boolean;
};

export async function runCoreSchemaBootstrapTask(
  state: CoreSchemaBootstrapTaskState,
  task: (database: CoreSchemaSqlExecutor) => Promise<void>,
  options: CoreSchemaTaskRunnerOptions,
): Promise<void> {
  if (state.ready) {
    return;
  }
  if (state.initPromise) {
    await state.initPromise;
    return;
  }

  const database = options.database ?? db;
  const promise = (async () => {
    try {
      await database.execute(sql`SET search_path TO public`);
      await task(database);
      state.ready = true;
    } catch (err) {
      logger.error(options.errorMessage, { error: err });
      if (options.rethrowError ?? true) {
        throw err;
      }
    }
  })();

  state.initPromise = promise;

  try {
    await promise;
  } finally {
    state.initPromise = null;
  }
}

export async function ensureCorePerformanceIndexes(
  database: CoreSchemaSqlExecutor = db,
) {
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_rows_import_id ON data_rows(import_id)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_rows_import_id_id ON data_rows(import_id, id)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_is_deleted ON imports(is_deleted)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_login_time ON user_activity(login_time)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_logout_time ON user_activity(logout_time)`);
}

export async function ensureCorePerformanceTrigramIndexes(
  database: CoreSchemaSqlExecutor = db,
) {
  await database.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_json_text_trgm
    ON data_rows
    USING GIN ((json_data::text) gin_trgm_ops)
  `);
  await database.execute(sql`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_rows_json_text_lower_trgm
    ON data_rows
    USING GIN (lower(json_data::text) gin_trgm_ops)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_mykad_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. MyKad',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_idno_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'ID No',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_nopengenalan_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No Pengenalan',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_ic_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'IC',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_cardno_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Card No',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_accountno_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Account No',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_accountnumber_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Account Number',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_akaunpemohon_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Nombor Akaun Bank Pemohon',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_noakaun_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No Akaun',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_telrumah_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. Telefon Rumah',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_telbimbit_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. Telefon Bimbit',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_phone_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Phone',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_handphone_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Handphone',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_officephone_digits
    ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'OfficePhone',''), '[^0-9]', '', 'g')))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_nob_trgm
    ON data_rows
    USING GIN (((json_data::jsonb)->>'NOB') gin_trgm_ops)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_employer_name_trgm
    ON data_rows
    USING GIN (((json_data::jsonb)->>'EMPLOYER NAME') gin_trgm_ops)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_nature_business_trgm
    ON data_rows
    USING GIN (((json_data::jsonb)->>'NATURE OF BUSINESS') gin_trgm_ops)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_nama_trgm
    ON data_rows
    USING GIN (((json_data::jsonb)->>'Nama') gin_trgm_ops)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_customer_name_trgm
    ON data_rows
    USING GIN (((json_data::jsonb)->>'Customer Name') gin_trgm_ops)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_name_trgm
    ON data_rows
    USING GIN (((json_data::jsonb)->>'name') gin_trgm_ops)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_mykad_exact
    ON data_rows (((json_data::jsonb)->>'No. MyKad'))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_idno_exact
    ON data_rows (((json_data::jsonb)->>'ID No'))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_nopengenalan_exact
    ON data_rows (((json_data::jsonb)->>'No Pengenalan'))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_ic_exact
    ON data_rows (((json_data::jsonb)->>'IC'))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_accountno_exact
    ON data_rows (((json_data::jsonb)->>'Account No'))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_accountnumber_exact
    ON data_rows (((json_data::jsonb)->>'Account Number'))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_cardno_exact
    ON data_rows (((json_data::jsonb)->>'Card No'))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_noakaun_exact
    ON data_rows (((json_data::jsonb)->>'No Akaun'))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_akaunpemohon_exact
    ON data_rows (((json_data::jsonb)->>'Nombor Akaun Bank Pemohon'))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_telrumah_exact
    ON data_rows (((json_data::jsonb)->>'No. Telefon Rumah'))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_telbimbit_exact
    ON data_rows (((json_data::jsonb)->>'No. Telefon Bimbit'))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_phone_exact
    ON data_rows (((json_data::jsonb)->>'Phone'))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_handphone_exact
    ON data_rows (((json_data::jsonb)->>'Handphone'))
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_data_rows_officephone_exact
    ON data_rows (((json_data::jsonb)->>'OfficePhone'))
  `);
}
