import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { logger } from "../lib/logger";
import type {
  SettingsBootstrapSqlExecutor,
  SettingsBootstrapTaskState,
} from "./settings-bootstrap-shared";

type SettingsBootstrapTaskRunnerOptions = {
  database?: SettingsBootstrapSqlExecutor;
  errorMessage: string;
};

export async function runSettingsBootstrapTask(
  state: SettingsBootstrapTaskState,
  task: (database: SettingsBootstrapSqlExecutor) => Promise<void>,
  options: SettingsBootstrapTaskRunnerOptions,
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
    } catch (err: any) {
      logger.error(options.errorMessage, { error: err });
    }
  })();

  state.initPromise = promise;

  try {
    await promise;
  } finally {
    state.initPromise = null;
  }
}
