import { sql, type SQL } from "drizzle-orm";
import { db } from "../db-postgres";
import type { CategoryRule, CategoryStatRow, CategoryStatSample } from "./ai-category-types";
import { buildMatchSql, mapCategorySampleRow } from "./ai-category-utils";
import { getCategoryStats } from "./ai-category-read-repository";

async function upsertCategoryStats(params: {
  key: string;
  total: number;
  samples: CategoryStatSample[];
}) {
  await db.execute(sql`
    INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
    VALUES (${params.key}, ${params.total}, ${JSON.stringify(params.samples)}::jsonb, now())
    ON CONFLICT (key)
    DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
  `);
}

async function upsertAllCategoryStats(totalRows: number) {
  await db.execute(sql`
    INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
    VALUES ('__all__', ${totalRows}, '[]'::jsonb, now())
    ON CONFLICT (key)
    DO UPDATE SET total = EXCLUDED.total, updated_at = now()
  `);
}

async function countAllCategoryRows(): Promise<number> {
  const totalRes = await db.execute(sql`
    SELECT COUNT(*)::int as "count"
    FROM public.data_rows dr
    JOIN public.imports i ON i.id = dr.import_id
    WHERE i.is_deleted = false
  `);
  return Number((totalRes.rows as Array<{ count?: unknown }>)[0]?.count ?? 0);
}

async function computeCategoryGroupStats(termSql: SQL): Promise<{
  total: number;
  samples: CategoryStatSample[];
}> {
  const countRes = await db.execute(sql`
    SELECT COUNT(*)::int as "count"
    FROM public.data_rows dr
    JOIN public.imports i ON i.id = dr.import_id
    WHERE i.is_deleted = false
      AND (${termSql})
  `);
  const total = Number((countRes.rows as Array<{ count?: unknown }>)[0]?.count ?? 0);

  let samples: CategoryStatSample[] = [];
  if (total > 0) {
    const sampleRes = await db.execute(sql`
      SELECT dr.json_data as "jsonData", i.name as "importName", i.filename as "importFilename"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND (${termSql})
      LIMIT 10
    `);

    samples = (sampleRes.rows as Array<{
      jsonData?: unknown;
      importName?: string | null;
      importFilename?: string | null;
    }>).map(mapCategorySampleRow);
  }

  return { total, samples };
}

async function computeComplementCategoryStats(combined: SQL | null, totalRows: number): Promise<{
  total: number;
  samples: CategoryStatSample[];
}> {
  if (!combined) {
    return { total: totalRows, samples: [] };
  }

  const countRes = await db.execute(sql`
    SELECT COUNT(*)::int as "count"
    FROM public.data_rows dr
    JOIN public.imports i ON i.id = dr.import_id
    WHERE i.is_deleted = false
      AND NOT (${combined})
  `);
  const total = Number((countRes.rows as Array<{ count?: unknown }>)[0]?.count ?? 0);

  let samples: CategoryStatSample[] = [];
  if (total > 0) {
    const sampleRes = await db.execute(sql`
      SELECT dr.json_data as "jsonData", i.name as "importName", i.filename as "importFilename"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND NOT (${combined})
      LIMIT 10
    `);

    samples = (sampleRes.rows as Array<{
      jsonData?: unknown;
      importName?: string | null;
      importFilename?: string | null;
    }>).map(mapCategorySampleRow);
  }

  return { total, samples };
}

export async function computeCategoryStatsForKeys(
  keys: string[],
  groups: CategoryRule[],
): Promise<CategoryStatRow[]> {
  if (!keys.length) return [];

  const uniqueKeys = Array.from(new Set(keys));
  const ruleMap = new Map(groups.map((group) => [group.key, group]));
  const requestedGroups = uniqueKeys
    .filter((key) => key !== "__all__")
    .map((key) => ruleMap.get(key))
    .filter((group): group is CategoryRule => Boolean(group && group.enabled !== false));

  if (uniqueKeys.includes("__all__")) {
    await upsertAllCategoryStats(await countAllCategoryRows());
  }

  for (const group of requestedGroups) {
    const terms = (group.terms || []).filter((term) => term.trim().length > 0);
    const fields = (group.fields || []).filter((field) => field.trim().length > 0);
    const matchMode = String(group.matchMode || "contains").toLowerCase();
    const termSql = buildMatchSql(terms, fields, matchMode);

    if (!termSql) {
      await upsertCategoryStats({ key: group.key, total: 0, samples: [] });
      continue;
    }

    await upsertCategoryStats({
      key: group.key,
      ...await computeCategoryGroupStats(termSql),
    });
  }

  return getCategoryStats(uniqueKeys);
}

export async function rebuildCategoryStats(groups: CategoryRule[]): Promise<void> {
  if (!groups.length) return;

  const totalRows = await countAllCategoryRows();

  await db.execute(sql`
    DELETE FROM public.ai_category_stats
    WHERE key <> '__all__'
  `);
  await upsertAllCategoryStats(totalRows);

  const enabledGroups = groups.filter((group) => group.enabled !== false);
  const baseGroups = enabledGroups.filter((group) => String(group.matchMode || "").toLowerCase() !== "complement");
  const complementGroups = enabledGroups.filter((group) => String(group.matchMode || "").toLowerCase() === "complement");
  const matchSqlByKey = new Map<string, SQL>();

  for (const group of baseGroups) {
    const terms = (group.terms || []).filter((term) => term.trim().length > 0);
    const fields = (group.fields || []).filter((field) => field.trim().length > 0);
    const matchMode = String(group.matchMode || "contains").toLowerCase();
    const termSql = buildMatchSql(terms, fields, matchMode);

    if (!termSql) {
      await upsertCategoryStats({ key: group.key, total: 0, samples: [] });
      continue;
    }

    matchSqlByKey.set(group.key, termSql);
    await upsertCategoryStats({
      key: group.key,
      ...await computeCategoryGroupStats(termSql),
    });
  }

  if (complementGroups.length === 0) {
    return;
  }

  const combined = matchSqlByKey.size > 0
    ? sql.join(Array.from(matchSqlByKey.values()).map((value) => sql`(${value})`), sql` OR `)
    : null;

  for (const group of complementGroups) {
    await upsertCategoryStats({
      key: group.key,
      ...await computeComplementCategoryStats(combined, totalRows),
    });
  }
}
