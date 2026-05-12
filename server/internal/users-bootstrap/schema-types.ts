import { db } from "../../db-postgres";

export type BootstrapSqlExecutor = Pick<typeof db, "execute">;
