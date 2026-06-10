import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

test("db migrate keeps a second pool connection available while advisory lock is held", () => {
  const source = readFileSync(new URL("../db-migrate.mjs", import.meta.url), "utf8");

  assert.match(source, /withPostgresMigrationAdvisoryLock\(pool/);
  assert.match(source, /buildPostgresPoolConfig\(process\.env,\s*\{\s*max:\s*2\s*\}\)/s);
});

test("backup payload chunk migration is safe for legacy runtime-created tables", () => {
  const source = readFileSync(new URL("../../drizzle/0028_nervous_spitfire.sql", import.meta.url), "utf8");

  assert.match(source, /CREATE TABLE IF NOT EXISTS "backup_payload_chunks"/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS "backup_id" text/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS "chunk_index" integer/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS "chunk_data" text/);
  assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS "idx_backup_payload_chunks_backup_chunk_unique"/);
  assert.match(source, /CREATE INDEX IF NOT EXISTS "idx_backup_payload_chunks_backup_id"/);
  assert.match(source, /conname = 'backup_payload_chunks_backup_id_backups_id_fk'/);
  assert.match(source, /confrelid = 'public\.backups'::regclass/);
});

test("manager role permission migration backfills missing production settings", () => {
  const source = readFileSync(new URL("../../drizzle/0043_manager_role_permission_seed.sql", import.meta.url), "utf8");

  for (const key of [
    "tab_manager_home_enabled",
    "tab_manager_import_enabled",
    "tab_manager_general_search_enabled",
    "tab_manager_collection_report_enabled",
    "tab_manager_analysis_enabled",
    "tab_manager_dashboard_enabled",
    "tab_manager_settings_enabled",
  ]) {
    assert.match(source, new RegExp(key));
  }

  assert.match(source, /ON CONFLICT \(key\) DO UPDATE SET/);
  assert.match(source, /\('superuser', true, true\)/);
  assert.match(source, /\('admin', true, false\)/);
  assert.match(source, /\('manager', false, false\)/);
  assert.match(source, /\('user', false, false\)/);
  assert.match(source, /ON CONFLICT \(role, setting_key\) DO UPDATE SET/);
});

test("drizzle journal includes every SQL migration file", () => {
  const drizzleDir = new URL("../../drizzle/", import.meta.url);
  const migrationTags = readdirSync(drizzleDir)
    .filter((fileName) => /^\d{4}_.+\.sql$/.test(fileName))
    .map((fileName) => fileName.replace(/\.sql$/, ""))
    .sort();
  const journal = JSON.parse(readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  const journalTags = journal.entries.map((entry) => entry.tag).sort();

  assert.deepEqual(journalTags, migrationTags);
});
