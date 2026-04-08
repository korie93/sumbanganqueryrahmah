import { sql, type SQL } from "drizzle-orm";
import { db } from "../db-postgres";
import { buildLikePattern } from "./sql-like-utils";
import type { CategoryRule, CategoryStatRow } from "./ai-category-types";
import {
  buildTextInList,
  normalizeRuleArray,
  parseJsonObject,
} from "./ai-category-utils";

function toOptionalDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeCategoryStatSamples(value: unknown): CategoryStatRow["samples"] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const sample = parseJsonObject(item);
    return {
      name: String(sample.name ?? ""),
      ic: String(sample.ic ?? ""),
      source: sample.source == null ? null : String(sample.source),
    };
  });
}

export async function countRowsByCategoryKeywords(params: { groups: CategoryRule[] }): Promise<{
  totalRows: number;
  counts: Record<string, number>;
}> {
  const groups = params.groups || [];
  const countSqls: SQL[] = [];
  const matchSqlByKey = new Map<string, SQL>();

  for (const group of groups) {
    const terms = (group.terms || []).filter((term) => term.trim().length > 0);
    const fields = (group.fields || []).filter((field) => field.trim().length > 0);
    const matchMode = String(group.matchMode || "contains").toLowerCase();
    if (matchMode === "complement") continue;

    if (terms.length === 0 || fields.length === 0) {
      countSqls.push(sql`jsonb_build_object(${group.key}, 0::int)`);
      continue;
    }

    const termSql = matchMode === "exact"
      ? sql.join(
          fields.map((field) => {
            const list = sql.join(
              terms.map((value) => sql`${value.toUpperCase()}`),
              sql`, `,
            );
            return sql`upper(trim(coalesce((dr.json_data::jsonb)->>${field}, ''))) IN (${list})`;
          }),
          sql` OR `,
        )
      : sql.join(
          terms.map((term) => {
            const termPattern = buildLikePattern(term, "contains");
            const perField = sql.join(
              fields.map((field) => sql`coalesce((dr.json_data::jsonb)->>${field}, '') ILIKE ${termPattern} ESCAPE '\'`),
              sql` OR `,
            );
            return sql`((${perField}) OR dr.json_data::text ILIKE ${termPattern} ESCAPE '\')`;
          }),
          sql` OR `,
        );

    matchSqlByKey.set(group.key, termSql);
    countSqls.push(sql`jsonb_build_object(${group.key}, COUNT(*) FILTER (WHERE (${termSql}))::int)`);
  }

  const complementGroups = groups.filter((group) => String(group.matchMode || "").toLowerCase() === "complement");
  if (complementGroups.length > 0) {
    if (matchSqlByKey.size > 0) {
      const combined = sql.join(Array.from(matchSqlByKey.values()).map((value) => sql`(${value})`), sql` OR `);
      for (const group of complementGroups) {
        countSqls.push(sql`jsonb_build_object(${group.key}, COUNT(*) FILTER (WHERE NOT (${combined}))::int)`);
      }
    } else {
      for (const group of complementGroups) {
        countSqls.push(sql`jsonb_build_object(${group.key}, COUNT(*)::int)`);
      }
    }
  }

  const selectParts = countSqls.length > 0 ? sql.join(countSqls, sql` || `) : sql`'{}'::jsonb`;
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int as "total",
      (${selectParts}) as "counts"
    FROM public.data_rows dr
    JOIN public.imports i ON i.id = dr.import_id
    WHERE i.is_deleted = false
  `);

  const row = (result.rows as Array<{ total?: unknown; counts?: unknown }>)[0] || {};
  const totalRows = Number(row.total ?? 0);
  const countsRecord = parseJsonObject(row.counts);
  const counts: Record<string, number> = {};

  for (const group of groups) {
    counts[group.key] = Number(countsRecord[group.key] ?? 0);
  }

  return { totalRows, counts };
}

export async function getCategoryRules(): Promise<Array<{
  key: string;
  terms: string[];
  fields: string[];
  matchMode: string;
  enabled: boolean;
}>> {
  const result = await db.execute(sql`
    SELECT key, terms, fields, match_mode, enabled
    FROM public.ai_category_rules
    ORDER BY key
  `);

  return (result.rows as Array<{
    key?: unknown;
    terms?: unknown;
    fields?: unknown;
    match_mode?: unknown;
    enabled?: unknown;
  }>).map((row) => ({
    key: String(row.key),
    terms: normalizeRuleArray(row.terms),
    fields: normalizeRuleArray(row.fields),
    matchMode: String(row.match_mode || "contains"),
    enabled: row.enabled !== false,
  }));
}

export async function getCategoryRulesMaxUpdatedAt(): Promise<Date | null> {
  const result = await db.execute(sql`
    SELECT MAX(updated_at) as updated_at
    FROM public.ai_category_rules
  `);
  const row = (result.rows as Array<{ updated_at?: unknown }>)[0];
  return toOptionalDate(row?.updated_at);
}

export async function getCategoryStats(keys: string[]): Promise<CategoryStatRow[]> {
  if (!keys.length) return [];

  const result = await db.execute(sql`
    SELECT key, total, samples, updated_at
    FROM public.ai_category_stats
    WHERE key IN (${buildTextInList(keys)})
  `);

  return (result.rows as Array<{
    key?: unknown;
    total?: unknown;
    samples?: unknown;
    updated_at?: unknown;
  }>).map((row) => ({
    key: String(row.key ?? ""),
    total: Number(row.total ?? 0),
    samples: normalizeCategoryStatSamples(row.samples),
    updatedAt: toOptionalDate(row.updated_at),
  }));
}
