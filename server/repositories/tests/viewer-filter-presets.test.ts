import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { viewerFilterPresetCreateSchema, viewerFilterPresetNameSchema, type ViewerFilterPresetCreateInput } from "../../../shared/common/viewer-filter-presets";
import { ViewerFilterPresetsRepository, type ViewerPresetDatabase } from "../viewer-filter-presets.repository";
import { ViewerFilterPresetsService } from "../../services/viewer-filter-presets.service";

const payload = { name: "Monthly check", columnFilters: [{ column: "Date", operator: "dateBetween" as const, value: "2024-02-01", valueTo: "2024-02-29" }], numericSort: { column: "Amount", direction: "desc" as const } };
const uuid = "0adf3e41-8a8f-4fae-8ad8-b1d42c277283";

test("Viewer preset contract trims names and rejects control characters, unknown keys and incomplete filters", () => {
  assert.equal(viewerFilterPresetNameSchema.parse("  Monthly check  "), "Monthly check");
  for (const name of ["", " ", "a".repeat(61), "\nPrivate", "a\u0085b", "x\u0000y"]) assert.equal(viewerFilterPresetNameSchema.safeParse(name).success, false);
  for (const raw of [{ ...payload, ownerUserId: "foreign" }, { ...payload, name: "x", columnFilters: [] as unknown[], numericSort: null },
    { ...payload, columnFilters: [{ ...payload.columnFilters[0], valueTo: "" }] },
    { ...payload, columnFilters: [{ ...payload.columnFilters[0], valueTo: "2024-02-30" }] },
    { ...payload, columnFilters: [{ ...payload.columnFilters[0], value: "2024-03-01" }] },
    { ...payload, columnFilters: Array.from({ length: 11 }, () => payload.columnFilters[0]) },
    { ...payload, numericSort: { ...payload.numericSort, direction: "sideways" } },
    { ...payload, columnFilters: [{ column: "Amount", operator: "lessThan", value: "1e3" }] },
    { ...payload, columnFilters: [{ column: "Name", operator: "contains", value: "   " }] },
    { ...payload, columnFilters: [{ column: "Name", operator: "equals", value: "ok", valueTo: "hidden" }] },
    { ...payload, columnFilters: [{ column: "Name", operator: "contains", value: "a\u0000b" }] },
    { ...payload, columnFilters: [{ column: "Name", operator: "contains", value: "a\ud800b" }] },
  ]) assert.equal(viewerFilterPresetCreateSchema.safeParse(raw).success, false, JSON.stringify(raw));
  assert.equal(viewerFilterPresetCreateSchema.safeParse({ ...payload, columnFilters: [], numericSort: payload.numericSort }).success, true);
});

test("Viewer preset service rejects stale columns before persistence and forwards only the internal owner", async () => {
  const calls: unknown[] = [];
  const store = {
    list: async (owner: string, file: string) => { calls.push(["list", owner, file]); return []; },
    create: async (owner: string, file: string, input: ViewerFilterPresetCreateInput) => { calls.push(["create", owner, file, input]); return { id: uuid, ...input }; },
    rename: async () => ({ id: uuid, ...payload }), delete: async () => {},
  };
  const service = new ViewerFilterPresetsService(store, {
    getImportById: async () => ({ id: "file" }) as never,
    getImportColumnNames: async () => ["Date", "Amount"],
  });
  const result = await service.create("internal-owner", "file", payload);
  assert.equal(result.id, uuid);
  assert.equal((calls[0] as unknown[])[1], "internal-owner");
  await assert.rejects(() => service.create("internal-owner", "file", { ...payload, numericSort: { column: "Missing", direction: "asc" } }), /not available/);
  await assert.rejects(() => service.create("internal-owner", "file", { ...payload, columnFilters: [{ ...payload.columnFilters[0]!, column: "Missing" }] }), /not available/);
  assert.equal(calls.length, 1);
});

test("Viewer preset repository binds owner and file in every read/write and rejects unavailable scope before payload access", async () => {
  const dialect = new PgDialect(), queries: Array<{ sql: string; params: unknown[] }> = [];
  const executor = { execute: async (query: Parameters<ViewerPresetDatabase["execute"]>[0]) => {
    const compiled = dialect.sqlToQuery(query.getSQL());
    queries.push(compiled);
    if (compiled.sql.includes("FROM public.users")) return { rows: [] };
    throw new Error("No configuration access is allowed for an unavailable owner.");
  } };
  const database: ViewerPresetDatabase = { ...executor, transaction: async run => run(executor) };
  const presets = new ViewerFilterPresetsRepository(database);
  for (const action of [() => presets.list("foreign-owner", "file"), () => presets.create("foreign-owner", "file", payload),
    () => presets.rename("foreign-owner", "file", uuid, "renamed"), () => presets.delete("foreign-owner", "file", uuid)]) {
    await assert.rejects(action, /not found/);
  }
  assert.equal(queries.length, 4);
  assert.ok(queries.every(query => query.sql.includes("FOR UPDATE") && query.params.includes("foreign-owner") && !query.sql.includes("foreign-owner")));
});

test("Viewer preset repository excludes malformed stored configuration", async () => {
  let index = 0;
  const replies = [{ rows: [{ id: "owner" }] }, { rows: [{ id: "file" }] }, { rows: [
    { id: uuid, ...payload }, { id: uuid, ...payload, ownerUserId: "unexpected" },
    { id: uuid, ...payload, columnFilters: [{ ...payload.columnFilters[0], value: "1900-02-29" }] },
  ] }];
  const execute = async () => replies[index++]!;
  const presets = new ViewerFilterPresetsRepository({ execute, transaction: async run => run({ execute }) });
  assert.deepEqual(await presets.list("owner", "file"), [{ id: uuid, ...payload }]);
});
