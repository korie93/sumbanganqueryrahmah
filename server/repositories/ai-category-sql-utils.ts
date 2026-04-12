import { sql, type SQL } from "drizzle-orm";
import { buildLikePattern } from "./sql-like-utils";

export function buildTextInList(values: string[]) {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

export function buildMatchSql(terms: string[], fields: string[], matchMode: string): SQL | null {
  if (terms.length === 0) return null;

  if (fields.length === 0) {
    return sql.join(
      terms.map((term) => sql`dr.json_data::text ILIKE ${buildLikePattern(term, "contains")} ESCAPE '\'`),
      sql` OR `,
    );
  }

  if (matchMode === "exact") {
    return sql.join(
      fields.map((field) => {
        const list = sql.join(
          terms.map((value) => sql`${value.toUpperCase()}`),
          sql`, `,
        );
        return sql`upper(trim(coalesce((dr.json_data::jsonb)->>${field}, ''))) IN (${list})`;
      }),
      sql` OR `,
    );
  }

  return sql.join(
    terms.map((term) => {
      const termPattern = buildLikePattern(term, "contains");
      const perField = sql.join(
        fields.map((field) => sql`(dr.json_data::jsonb)->>${field} ILIKE ${termPattern} ESCAPE '\'`),
        sql` OR `,
      );
      return sql`(${perField})`;
    }),
    sql` OR `,
  );
}
