import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { logger } from "../lib/logger";

type CoreSchemaTaskRunnerOptions = {
  errorMessage: string;
};

export async function runCoreSchemaBootstrapTask(params: {
  initPromise: Promise<void> | null;
  isReady: boolean;
  options: CoreSchemaTaskRunnerOptions;
  setInitPromise: (promise: Promise<void> | null) => void;
  setReady: () => void;
  task: () => Promise<void>;
}): Promise<void> {
  if (params.isReady) {
    return;
  }
  if (params.initPromise) {
    await params.initPromise;
    return;
  }

  const promise = (async () => {
    try {
      await db.execute(sql`SET search_path TO public`);
      await params.task();
      params.setReady();
    } catch (err: any) {
      logger.error(params.options.errorMessage, { error: err });
      throw err;
    }
  })();

  params.setInitPromise(promise);

  try {
    await promise;
  } finally {
    params.setInitPromise(null);
  }
}

export async function ensureCorePerformanceIndexes() {
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_rows_import_id ON data_rows(import_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_is_deleted ON imports(is_deleted)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_login_time ON user_activity(login_time)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_logout_time ON user_activity(logout_time)`);
}

export async function ensureCorePerformanceTrigramIndexes() {
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
}
