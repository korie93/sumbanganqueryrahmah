import { sql, type SQL } from "drizzle-orm";
import { buildLikePattern } from "./sql-like-utils";
import type { CategoryStatSample } from "./ai-category-types";

export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

export function buildTextInList(values: string[]) {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

export function normalizeRuleArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter((entry) => entry.trim().length > 0);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((entry) => entry.replace(/^\"|\"$/g, "").trim())
        .filter((entry) => entry.length > 0);
    }
    return [trimmed];
  }

  return [];
}

export function parseJsonData(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }

  return {};
}

export function extractName(data: Record<string, unknown>): string {
  return String(
    data["Nama"] ||
    data["Customer Name"] ||
    data["name"] ||
    data["MAKLUMAT PEMOHON"] ||
    "-",
  );
}

export function extractIc(data: Record<string, unknown>): string {
  return String(
    data["No. MyKad"] ||
    data["ID No"] ||
    data["No Pengenalan"] ||
    data["IC"] ||
    "-",
  );
}

export function mapCategorySampleRow(row: {
  jsonData?: unknown;
  importName?: string | null;
  importFilename?: string | null;
}): CategoryStatSample {
  const data = parseJsonData(row.jsonData);
  const source = row.importName || row.importFilename || null;
  return {
    name: extractName(data),
    ic: extractIc(data),
    source,
  };
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
