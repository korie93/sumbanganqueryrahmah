import { db } from "../../db-postgres";
import { hardenLegacyUserCredentials } from "./schema-credentials";
import { ensureUsersBootstrapIntegrity } from "./schema-integrity";
import { normalizeUsersBootstrapRows } from "./schema-normalization";
import { ensureSystemActorBootstrapUser } from "./schema-system-actor";
import { ensureUsersBootstrapTablesAndColumns } from "./schema-tables";
import type { BootstrapSqlExecutor } from "./schema-types";

export async function ensureUsersBootstrapSchema(
  database: BootstrapSqlExecutor = db,
): Promise<void> {
  await ensureUsersBootstrapTablesAndColumns(database);
  await hardenLegacyUserCredentials(database);
  await normalizeUsersBootstrapRows(database);
  await ensureSystemActorBootstrapUser(database);
  await ensureUsersBootstrapIntegrity(database);
}

export type { BootstrapSqlExecutor } from "./schema-types";
