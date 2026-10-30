import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { viewerFilterPresetCreateSchema } from "../../../shared/common/viewer-filter-presets";

test("Viewer private presets enforce atomic owner-file quotas, IDOR isolation, lifecycle and guarded payloads in PostgreSQL", {
  skip: process.env.SQR_AUTH_ISOLATED_CLUSTER !== "1",
}, async () => {
  assert.equal(process.env.PG_HOST, "127.0.0.1");
  assert.equal(process.env.PG_DATABASE, "sqr_auth_recovery_test");
  assert.equal(process.env.PG_USER, "sqr_fixture");
  for (const key of ["DATABASE_URL", "DATABASE_READ_REPLICA_URL"]) assert.equal(Object.prototype.hasOwnProperty.call(process.env, key), false);
  delete process.env.SQR_AUTH_ISOLATED_CLUSTER;
  const runtime = await import("../../db-postgres");
  runtime.stopPgPoolBackgroundTasks();
  const { pool, db } = runtime;
  try {
    // Exercise the same hardened user schema when run alone or after auth tests.
    const { ensureUsersBootstrapSchema } = await import("../../internal/users-bootstrap/schema");
    await ensureUsersBootstrapSchema(db);
    await pool.query(`CREATE TABLE IF NOT EXISTS imports (
      id text PRIMARY KEY, name text NOT NULL, filename text NOT NULL, content_hash_sha256 text, source_size_bytes bigint,
      created_at timestamptz NOT NULL DEFAULT now(), last_opened_at timestamptz, is_deleted boolean NOT NULL DEFAULT false, created_by text
    ); CREATE TABLE IF NOT EXISTS data_rows (
      id text PRIMARY KEY, import_id text NOT NULL REFERENCES imports(id) ON UPDATE CASCADE ON DELETE CASCADE, json_data jsonb NOT NULL
    );`);
    await pool.query(readFileSync(new URL("../../../drizzle/0065_viewer_filter_presets.sql", import.meta.url), "utf8"));
    const { ensureViewerFilterPresetsTable } = await import("../../internal/viewer-filter-presets-schema");
    await ensureViewerFilterPresetsTable(db);
    await ensureViewerFilterPresetsTable(db);
    const { ViewerFilterPresetsRepository } = await import("../viewer-filter-presets.repository");
    const { ViewerFilterPresetsService } = await import("../../services/viewer-filter-presets.service");
    const { ImportsRepository } = await import("../imports.repository");
    const repository = new ViewerFilterPresetsRepository(), service = new ViewerFilterPresetsService(repository, new ImportsRepository());
    for (const id of ["preset-owner-a", "preset-owner-b", "preset-race-owner"]) {
      await pool.query("INSERT INTO users(id,username,password_hash,role,status) VALUES($1,$1,'fixture-not-an-authentication-hash','user','active')", [id]);
    }
    for (const id of ["preset-file-a", "preset-file-b"]) {
      await pool.query("INSERT INTO imports(id,name,filename) VALUES($1,$1,'preset.csv')", [id]);
      await pool.query("INSERT INTO data_rows(id,import_id,json_data) VALUES($1,$2,$3::jsonb)", [`${id}-row`, id, JSON.stringify({ Date: "2024-02-29", Amount: "1,000.50", Name: "Fictional" })]);
    }
    const input = viewerFilterPresetCreateSchema.parse({ name: "Monthly check", columnFilters: [
      { column: "Date", operator: "dateBetween", value: "2024-02-01", valueTo: "2024-02-29" },
      { column: "Amount", operator: "between", value: "1,000.50", valueTo: "9007199254740993.01" },
    ], numericSort: { column: "Amount", direction: "desc" } });
    const first = await service.create("preset-owner-a", "preset-file-a", input);
    assert.deepEqual(await repository.list("preset-owner-a", "preset-file-a"), [first]);
    assert.deepEqual(await repository.list("preset-owner-b", "preset-file-a"), []);
    assert.deepEqual(await repository.list("preset-owner-a", "preset-file-b"), []);
    for (const [owner, file] of [["preset-owner-b", "preset-file-a"], ["preset-owner-a", "preset-file-b"]]) {
      await assert.rejects(() => repository.rename(owner!, file!, first.id, "Stolen"), /Preset not found/);
      await assert.rejects(() => repository.delete(owner!, file!, first.id), /Preset not found/);
    }
    await assert.rejects(() => service.create("preset-owner-a", "preset-file-a", { ...input, name: "monthly CHECK" }), /already exists/);
    // Same name is permitted in another account or file; never deduplicate across owners.
    const second = await service.create("preset-owner-b", "preset-file-a", input);
    await service.create("preset-owner-a", "preset-file-b", input);
    const renamed = await repository.rename("preset-owner-a", "preset-file-a", first.id, "Renamed check");
    assert.equal(renamed.name, "Renamed check");
    assert.deepEqual(renamed.columnFilters, input.columnFilters);
    await assert.rejects(() => service.create("preset-owner-a", "preset-file-a", { ...input, columnFilters: [{ column: "Missing", operator: "equals", value: "x" }] }), /not available/);
    await assert.rejects(() => service.create("preset-owner-a", "preset-file-a", { ...input, columnFilters: [{ column: "Date", operator: "dateBefore", value: "1900-02-29" }] }));
    // All 12 requests race for 10 slots; the owner-row lock prevents count/insert races.
    const raced = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => service.create("preset-race-owner", "preset-file-a", { ...input, name: `Race ${index}` })));
    assert.equal(raced.filter(result => result.status === "fulfilled").length, 10);
    assert.equal(raced.filter(result => result.status === "rejected" && /up to 10/.test(String(result.reason))).length, 2);
    assert.equal((await repository.list("preset-race-owner", "preset-file-a")).length, 10);
    const duplicateRace = await Promise.allSettled(["Same", "same"].map(name => service.create("preset-race-owner", "preset-file-b", { ...input, name })));
    assert.equal(duplicateRace.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(duplicateRace.filter(result => result.status === "rejected" && /already exists/.test(String(result.reason))).length, 1);
    const originalCount = Number((await pool.query("SELECT count(*) AS count FROM viewer_filter_presets")).rows[0].count);
    // Guarding array length with CASE produces a check violation, never an unsafe cast/function error.
    await assert.rejects(() => pool.query("INSERT INTO viewer_filter_presets(owner_user_id,import_id,name,column_filters) VALUES($1,$2,'Dirty object','{}'::jsonb)", ["preset-owner-a", "preset-file-a"]), (error: unknown) => (error as { code: string }).code === "23514");
    const dirtyId = "b14cda35-f09a-4cb9-975f-e477b23e3c4e";
    await pool.query("INSERT INTO viewer_filter_presets(id,owner_user_id,import_id,name,column_filters) VALUES($1,$2,$3,'Malformed stored dates',$4::jsonb)",
      [dirtyId, "preset-owner-a", "preset-file-a", JSON.stringify([{ column: "Date", operator: "dateBefore", value: "2100-02-29" }])]);
    assert.equal((await repository.list("preset-owner-a", "preset-file-a")).some(item => item.id === dirtyId), false);
    assert.equal(Number((await pool.query("SELECT count(*) AS count FROM viewer_filter_presets")).rows[0].count), originalCount + 1);
    // Worst-case escaped valid text stays within the database byte guard.
    const escaped = viewerFilterPresetCreateSchema.parse({ name: "Escaped payload", columnFilters: Array.from({ length: 10 }, () => ({ column: "Name", operator: "contains", value: `x${"\u0001".repeat(499)}` })), numericSort: null });
    const escapedPreset = await service.create("preset-owner-a", "preset-file-a", escaped);
    assert.equal(escapedPreset.columnFilters[0]!.value.length, 500);
    await pool.query("UPDATE imports SET is_deleted = true WHERE id = 'preset-file-a'");
    for (const action of [() => repository.list("preset-owner-a", "preset-file-a"), () => repository.create("preset-owner-a", "preset-file-a", input),
      () => repository.rename("preset-owner-a", "preset-file-a", first.id, "Hidden"), () => repository.delete("preset-owner-a", "preset-file-a", first.id)]) await assert.rejects(action, /Import not found/);
    await pool.query("UPDATE imports SET is_deleted = false WHERE id = 'preset-file-a'");
    await pool.query("UPDATE users SET status = 'deleted' WHERE id = 'preset-owner-a'");
    await assert.rejects(() => repository.list("preset-owner-a", "preset-file-b"), /scope not found/);
    await pool.query("UPDATE users SET is_banned = true WHERE id = 'preset-owner-b'");
    await assert.rejects(() => repository.list("preset-owner-b", "preset-file-a"), /scope not found/);
    await pool.query("UPDATE users SET is_banned = false WHERE id = 'preset-owner-b'");
    await repository.delete("preset-owner-b", "preset-file-a", second.id);
    assert.deepEqual(await repository.list("preset-owner-b", "preset-file-a"), []);
    await pool.query("DELETE FROM imports WHERE id = 'preset-file-a'");
    assert.equal(Number((await pool.query("SELECT count(*) AS count FROM viewer_filter_presets WHERE import_id = 'preset-file-a'")).rows[0].count), 0);
    await pool.query("DELETE FROM users WHERE id = 'preset-race-owner'");
    assert.equal(Number((await pool.query("SELECT count(*) AS count FROM viewer_filter_presets WHERE owner_user_id = 'preset-race-owner'")).rows[0].count), 0);
  } finally { await runtime.closePostgresPools(); }
});
