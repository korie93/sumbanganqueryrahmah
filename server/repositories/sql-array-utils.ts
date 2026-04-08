import { sql, type SQL } from "drizzle-orm";

export function buildTextArraySql(values: string[]): SQL {
  return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`;
}
