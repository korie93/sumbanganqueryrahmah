import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { sql, type SQLWrapper } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import type { CollectionRepositoryExecutor } from "../../server/repositories/collection-nickname-utils";
import { resolveCollectionRecordCardSearchLinks } from "../../server/repositories/collection-record-card-search-utils";
import { buildCollectionRecordWhereSql } from "../../server/repositories/collection-record-query-filter-utils";

type FixturePlanCase = {
  label: string;
  search: string;
  sourceImportId: string;
  expectedRecordCount: number;
  omitSourceAndDateFilters?: boolean;
  omitOwnerFilter?: boolean;
};

type SafePlanNode = {
  nodeType: string;
  relation: string | null;
  index: string | null;
  actualRows: number;
  actualLoops: number;
  rowsRemovedByFilter: number;
};

function safeIdentifier(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_]+$/.test(value) ? value : null;
}

function summarizePlanNodes(value: unknown, target: SafePlanNode[] = []): SafePlanNode[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return target;
  const node = value as Record<string, unknown>;
  target.push({
    nodeType: typeof node["Node Type"] === "string" && /^[a-zA-Z ]+$/.test(node["Node Type"])
      ? node["Node Type"] : "Unknown",
    relation: safeIdentifier(node["Relation Name"]),
    index: safeIdentifier(node["Index Name"]),
    actualRows: Number(node["Actual Rows"] ?? 0),
    actualLoops: Number(node["Actual Loops"] ?? 0),
    rowsRemovedByFilter: Number(node["Rows Removed by Filter"] ?? 0),
  });
  for (const child of Array.isArray(node.Plans) ? node.Plans : []) summarizePlanNodes(child, target);
  return target;
}

/**
 * Read-only EXPLAIN evidence for a newly generated fixture database only.
 * Never print SQL, its bound parameters, the raw plan (which contains them),
 * customer values, account/card hashes, or fixture authentication credentials.
 */
export async function verifyCollectionCardSearchPlan(params: {
  executor: CollectionRepositoryExecutor;
  connection: Pick<PoolClient, "query">;
  dataDir: string;
  ownerLogin: string;
  historicalCase?: FixturePlanCase;
}) {
  assert.equal(process.env.PG_HOST, "127.0.0.1");
  assert.equal(process.env.PG_DATABASE, "sqr_collection_card_test");
  assert.equal(process.env.PG_USER, "sqr_fixture");
  assert.equal(process.env.DATABASE_URL, undefined);
  assert.match(path.basename(path.dirname(params.dataDir)), /^sqr-collection-card-no-[a-zA-Z0-9]+$/);
  assert.match(params.ownerLogin, /^collectioncardfixture/);
  const state = await params.connection.query("SHOW data_directory");
  assert.equal(await realpath(state.rows[0].data_directory), await realpath(params.dataDir));

  const dialect = new PgDialect();
  const cases: FixturePlanCase[] = [{
    label: "indexed-card-source",
    search: "0000123412345678",
    sourceImportId: "fixture-card-source-a",
    expectedRecordCount: 51,
  }];
  if (params.historicalCase) cases.push(params.historicalCase);
  cases.push({
    ...cases[0],
    label: "indexed-default-user-search",
    omitSourceAndDateFilters: true,
  });
  cases.push({
    ...cases[0],
    label: "indexed-default-superuser-search",
    omitSourceAndDateFilters: true,
    omitOwnerFilter: true,
  });
  if (params.historicalCase) cases.push({
    ...params.historicalCase,
    label: "historical-default-user-search",
    omitSourceAndDateFilters: true,
  });

  for (const entry of cases) {
    assert.match(entry.label, /^[a-z-]+$/);
    assert.ok(Number.isInteger(entry.expectedRecordCount) && entry.expectedRecordCount > 0);
    const captured: Array<{ query: SQLWrapper; candidateCount: number }> = [];
    const recorder: CollectionRepositoryExecutor = {
      execute: async (query) => {
        assert.notEqual(typeof query, "string", "Card candidate query must be parameterized Drizzle SQL");
        const result = await params.executor.execute(query);
        captured.push({ query: query as SQLWrapper, candidateCount: result.rows?.length ?? 0 });
        return result;
      },
    };
    const filters = {
      search: entry.search,
      ...(!entry.omitSourceAndDateFilters ? {
        from: "2026-09-01",
        to: "2026-09-30",
        sourceImportIds: [entry.sourceImportId],
      } : {}),
      ...(!entry.omitOwnerFilter ? { createdByLogin: params.ownerLogin } : {}),
    };
    const links = await resolveCollectionRecordCardSearchLinks(recorder, filters);
    assert.equal(captured.length, 1, "Candidate resolution must not introduce per-record queries");
    assert.equal(captured[0].candidateCount, 1, "Repeated collections must collapse to their exact source identity");
    assert.equal(links.length, 1, "Fixture Card should reproduce exactly one authorized source identity");
    const countQuery = dialect.sqlToQuery(sql`
      SELECT COUNT(*)::int AS total FROM public.collection_records record
      ${buildCollectionRecordWhereSql({ ...filters, cardSearchSourceLinks: links })}
    `);
    const counted = await params.connection.query(countQuery.sql, countQuery.params);
    assert.equal(counted.rows[0]?.total, entry.expectedRecordCount,
      "Verified source tuple must include every matching collection before pagination");

    const candidateQuery = dialect.sqlToQuery(captured[0].query.getSQL());
    const explained = await params.connection.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${candidateQuery.sql}`,
      candidateQuery.params,
    );
    const report = explained.rows[0]?.["QUERY PLAN"]?.[0];
    assert.ok(report?.Plan, "PostgreSQL must return a real execution plan");
    const nodes = summarizePlanNodes(report.Plan);
    const relations = new Set(nodes.map((node) => node.relation).filter(Boolean));
    assert.ok(relations.has("collection_records"));
    assert.ok(relations.has("data_rows"));
    assert.ok(relations.has("collection_source_rows"));
    console.log(JSON.stringify({
      verification: "collection-card-query-plan",
      case: entry.label,
      candidateQueries: captured.length,
      candidateSourceRows: captured[0].candidateCount,
      verifiedSourceLinks: links.length,
      matchingCollectionRecords: counted.rows[0].total,
      sourceAndDateFilters: !entry.omitSourceAndDateFilters,
      ownerFilter: !entry.omitOwnerFilter,
      planningTimeMs: Number(report["Planning Time"] ?? 0),
      executionTimeMs: Number(report["Execution Time"] ?? 0),
      planNodes: nodes,
    }));
  }

  const outsideOwner = await resolveCollectionRecordCardSearchLinks(params.executor, {
    search: cases[0].search,
    createdByLogin: "collectioncardfixture-outside-owner",
  });
  assert.equal(outsideOwner.length, 0, "Source candidates outside existing access scope must be invisible");
}
