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
