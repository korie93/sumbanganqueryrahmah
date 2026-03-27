import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { buildLikePattern } from "./sql-like-utils";

type CategoryRule = {
  key: string;
  terms: string[];
  fields: string[];
  matchMode?: string;
  enabled?: boolean;
};

type CategoryStatRow = {
  key: string;
  total: number;
  samples: Array<{ name: string; ic: string; source: string | null }>;
  updatedAt: Date | null;
};

function parseJsonObject(value: unknown): Record<string, unknown> {
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

function buildTextInList(values: string[]) {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

function normalizeRuleArray(value: any): string[] {
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

function parseJsonData(value: unknown): Record<string, any> {
  if (value && typeof value === "object") {
    return value as Record<string, any>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function extractName(data: Record<string, any>): string {
  return (
    data["Nama"] ||
    data["Customer Name"] ||
    data["name"] ||
    data["MAKLUMAT PEMOHON"] ||
    "-"
  );
}

function extractIc(data: Record<string, any>): string {
  return (
    data["No. MyKad"] ||
    data["ID No"] ||
    data["No Pengenalan"] ||
    data["IC"] ||
    "-"
  );
}

function buildMatchSql(terms: string[], fields: string[], matchMode: string) {
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

export class AiCategoryRepository {
  async countRowsByKeywords(params: { groups: CategoryRule[] }): Promise<{
    totalRows: number;
    counts: Record<string, number>;
  }> {
    const groups = params.groups || [];
    const countSqls: Array<any> = [];
    const matchSqlByKey = new Map<string, any>();

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

    const row = (result.rows as any[])[0] || {};
    const totalRows = Number(row.total ?? 0);
    const countsRecord = parseJsonObject(row.counts);
    const counts: Record<string, number> = {};

    for (const group of groups) {
      counts[group.key] = Number(countsRecord[group.key] ?? 0);
    }

    return { totalRows, counts };
  }

  async getCategoryRules(): Promise<Array<{
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

    return (result.rows as any[]).map((row) => ({
      key: String(row.key),
      terms: normalizeRuleArray(row.terms),
      fields: normalizeRuleArray(row.fields),
      matchMode: String(row.match_mode || "contains"),
      enabled: row.enabled !== false,
    }));
  }

  async getCategoryRulesMaxUpdatedAt(): Promise<Date | null> {
    const result = await db.execute(sql`
      SELECT MAX(updated_at) as updated_at
      FROM public.ai_category_rules
    `);
    const row = (result.rows as any[])[0];
    return row?.updated_at ? new Date(row.updated_at) : null;
  }

  async getCategoryStats(keys: string[]): Promise<CategoryStatRow[]> {
    if (!keys.length) return [];

    const result = await db.execute(sql`
      SELECT key, total, samples, updated_at
      FROM public.ai_category_stats
      WHERE key IN (${buildTextInList(keys)})
    `);

    return (result.rows as any[]).map((row) => ({
      key: row.key,
      total: Number(row.total ?? 0),
      samples: Array.isArray(row.samples) ? row.samples : [],
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    }));
  }

  async computeCategoryStatsForKeys(keys: string[], groups: CategoryRule[]): Promise<CategoryStatRow[]> {
    if (!keys.length) return [];

    const uniqueKeys = Array.from(new Set(keys));
    const ruleMap = new Map(groups.map((group) => [group.key, group]));
    const requestedGroups = uniqueKeys
      .filter((key) => key !== "__all__")
      .map((key) => ruleMap.get(key))
      .filter((group): group is CategoryRule => Boolean(group && group.enabled !== false));

    if (uniqueKeys.includes("__all__")) {
      const totalRes = await db.execute(sql`
        SELECT COUNT(*)::int as "count"
        FROM public.data_rows dr
        JOIN public.imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
      `);
      const totalRows = Number((totalRes.rows as any[])[0]?.count ?? 0);
      await db.execute(sql`
        INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
        VALUES ('__all__', ${totalRows}, '[]'::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET total = EXCLUDED.total, updated_at = now()
      `);
    }

    for (const group of requestedGroups) {
      const terms = (group.terms || []).filter((term) => term.trim().length > 0);
      const fields = (group.fields || []).filter((field) => field.trim().length > 0);
      const matchMode = String(group.matchMode || "contains").toLowerCase();
      const termSql = buildMatchSql(terms, fields, matchMode);

      if (!termSql) {
        await db.execute(sql`
          INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
          VALUES (${group.key}, 0, '[]'::jsonb, now())
          ON CONFLICT (key)
          DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
        `);
        continue;
      }

      const countRes = await db.execute(sql`
        SELECT COUNT(*)::int as "count"
        FROM public.data_rows dr
        JOIN public.imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
          AND (${termSql})
      `);
      const total = Number((countRes.rows as any[])[0]?.count ?? 0);

      let samples: Array<{ name: string; ic: string; source: string | null }> = [];
      if (total > 0) {
        const sampleRes = await db.execute(sql`
          SELECT dr.json_data as "jsonData", i.name as "importName", i.filename as "importFilename"
          FROM public.data_rows dr
          JOIN public.imports i ON i.id = dr.import_id
          WHERE i.is_deleted = false
            AND (${termSql})
          LIMIT 10
        `);

        samples = (sampleRes.rows as any[]).map((row) => {
          const data = parseJsonData(row.jsonData);
          const source = row.importName || row.importFilename || null;
          return {
            name: String(extractName(data) || "-"),
            ic: String(extractIc(data) || "-"),
            source,
          };
        });
      }

      await db.execute(sql`
        INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
        VALUES (${group.key}, ${total}, ${JSON.stringify(samples)}::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
      `);
    }

    return this.getCategoryStats(uniqueKeys);
  }

  async rebuildCategoryStats(groups: CategoryRule[]): Promise<void> {
    if (!groups.length) return;

    const totalRes = await db.execute(sql`
      SELECT COUNT(*)::int as "count"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
    `);
    const totalRows = Number((totalRes.rows as any[])[0]?.count ?? 0);

    await db.execute(sql`
      DELETE FROM public.ai_category_stats
      WHERE key <> '__all__'
    `);
    await db.execute(sql`
      INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
      VALUES ('__all__', ${totalRows}, '[]'::jsonb, now())
      ON CONFLICT (key)
      DO UPDATE SET total = EXCLUDED.total, updated_at = now()
    `);

    const enabledGroups = groups.filter((group) => group.enabled !== false);
    const baseGroups = enabledGroups.filter((group) => String(group.matchMode || "").toLowerCase() !== "complement");
    const complementGroups = enabledGroups.filter((group) => String(group.matchMode || "").toLowerCase() === "complement");
    const matchSqlByKey = new Map<string, any>();

    for (const group of baseGroups) {
      const terms = (group.terms || []).filter((term) => term.trim().length > 0);
      const fields = (group.fields || []).filter((field) => field.trim().length > 0);
      const matchMode = String(group.matchMode || "contains").toLowerCase();
      const termSql = buildMatchSql(terms, fields, matchMode);

      if (!termSql) {
        await db.execute(sql`
          INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
          VALUES (${group.key}, 0, '[]'::jsonb, now())
          ON CONFLICT (key)
          DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
        `);
        continue;
      }

      matchSqlByKey.set(group.key, termSql);

      const countRes = await db.execute(sql`
        SELECT COUNT(*)::int as "count"
        FROM public.data_rows dr
        JOIN public.imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
          AND (${termSql})
      `);
      const total = Number((countRes.rows as any[])[0]?.count ?? 0);

      const sampleRes = await db.execute(sql`
        SELECT dr.json_data as "jsonData", i.name as "importName", i.filename as "importFilename"
        FROM public.data_rows dr
        JOIN public.imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
          AND (${termSql})
        LIMIT 10
      `);

      const samples = (sampleRes.rows as any[]).map((row) => {
        const data = parseJsonData(row.jsonData);
        const source = row.importName || row.importFilename || null;
        return {
          name: String(extractName(data) || "-"),
          ic: String(extractIc(data) || "-"),
          source,
        };
      });

      await db.execute(sql`
        INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
        VALUES (${group.key}, ${total}, ${JSON.stringify(samples)}::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
      `);
    }

    if (complementGroups.length === 0) {
      return;
    }

    const combined = matchSqlByKey.size > 0
      ? sql.join(Array.from(matchSqlByKey.values()).map((value) => sql`(${value})`), sql` OR `)
      : null;

    for (const group of complementGroups) {
      let total = totalRows;
      let samples: Array<{ name: string; ic: string; source: string | null }> = [];

      if (combined) {
        const countRes = await db.execute(sql`
          SELECT COUNT(*)::int as "count"
          FROM public.data_rows dr
          JOIN public.imports i ON i.id = dr.import_id
          WHERE i.is_deleted = false
            AND NOT (${combined})
        `);
        total = Number((countRes.rows as any[])[0]?.count ?? 0);

        const sampleRes = await db.execute(sql`
          SELECT dr.json_data as "jsonData", i.name as "importName", i.filename as "importFilename"
          FROM public.data_rows dr
          JOIN public.imports i ON i.id = dr.import_id
          WHERE i.is_deleted = false
            AND NOT (${combined})
          LIMIT 10
        `);

        samples = (sampleRes.rows as any[]).map((row) => {
          const data = parseJsonData(row.jsonData);
          const source = row.importName || row.importFilename || null;
          return {
            name: String(extractName(data) || "-"),
            ic: String(extractIc(data) || "-"),
            source,
          };
        });
      }

      await db.execute(sql`
        INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
        VALUES (${group.key}, ${total}, ${JSON.stringify(samples)}::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
      `);
    }
  }
}
