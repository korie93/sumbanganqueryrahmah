import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrationRollbackManifest } from "../db-migration-rollback.manifest.mjs";
import {
  discoverDrizzleMigrationTags,
  readDrizzleJournalTags,
  validateMigrationRollbackGovernance,
} from "../lib/db-migration-rollback-governance.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const drizzleDir = path.join(repoRoot, "drizzle");
const rollbackDir = path.join(drizzleDir, "rollback");

test("migration rollback manifest covers every reviewed Drizzle migration", () => {
  const migrationTags = discoverDrizzleMigrationTags({ drizzleDir });
  const journalTags = readDrizzleJournalTags({
    journalPath: path.join(drizzleDir, "meta", "_journal.json"),
  });

  const validation = validateMigrationRollbackGovernance({
    downSqlDir: rollbackDir,
    journalTags,
    manifest: migrationRollbackManifest,
    migrationTags,
  });

  assert.deepEqual(validation.failures, []);
  assert.equal(validation.coveredMigrations, migrationTags.length);
});

test("V7 persistence rollback preserves the append-only audit ledger", () => {
  const entry = migrationRollbackManifest.find(
    ({ migration }) => migration === "0054_collection_osp_reconciliation_persistence",
  );

  assert.ok(entry);
  assert.match(entry.preconditions.join("\n"), /append-only.*audit ledger/i);
  assert.match(entry.validationSteps.join("\n"), /rejects UPDATE, DELETE, and TRUNCATE/i);
});

test("V7 migration enforces append-only manual reconciliation audit history", () => {
  const migration = readFileSync(
    path.join(drizzleDir, "0054_collection_osp_reconciliation_persistence.sql"),
    "utf8",
  );

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.reject_collection_osp_manual_reconciliation_audit_mutation/i);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.collection_osp_manual_reconciliation_audit/i);
  assert.match(migration, /BEFORE TRUNCATE ON public\.collection_osp_manual_reconciliation_audit/i);
});

test("migration rollback governance rejects a missing manifest entry", () => {
  const migrationTags = ["0000_example", "0001_next"];
  const validation = validateMigrationRollbackGovernance({
    downSqlDir: rollbackDir,
    journalTags: migrationTags,
    manifest: [
      {
        backupRequired: true,
        migration: "0000_example",
        preconditions: ["backup exists"],
        rollbackSteps: ["restore backup"],
        strategy: "backup-restore",
        validationSteps: ["smoke preflight"],
      },
    ],
    migrationTags,
  });

  assert.match(validation.failures.join("\n"), /Missing rollback manifest entry for 0001_next/);
});

test("migration rollback governance rejects duplicate and unknown entries", () => {
  const manifest = [
    {
      backupRequired: true,
      migration: "0000_example",
      preconditions: ["backup exists"],
      rollbackSteps: ["restore backup"],
      strategy: "backup-restore",
      validationSteps: ["smoke preflight"],
    },
    {
      backupRequired: true,
      migration: "0000_example",
      preconditions: ["backup exists"],
      rollbackSteps: ["restore backup"],
      strategy: "backup-restore",
      validationSteps: ["smoke preflight"],
    },
    {
      backupRequired: true,
      migration: "9999_unknown",
      preconditions: ["backup exists"],
      rollbackSteps: ["restore backup"],
      strategy: "backup-restore",
      validationSteps: ["smoke preflight"],
    },
  ];

  const validation = validateMigrationRollbackGovernance({
    downSqlDir: rollbackDir,
    journalTags: ["0000_example"],
    manifest,
    migrationTags: ["0000_example"],
  });

  assert.match(validation.failures.join("\n"), /Duplicate rollback manifest entry for 0000_example/);
  assert.match(validation.failures.join("\n"), /references unknown migration 9999_unknown/);
});

test("migration rollback governance requires backups even for reversible-down plans", () => {
  const validation = validateMigrationRollbackGovernance({
    downSqlDir: rollbackDir,
    journalTags: ["0000_example"],
    manifest: [
      {
        backupRequired: false,
        downSqlPath: "0000_example.down.sql",
        migration: "0000_example",
        preconditions: ["backup exists"],
        rollbackSteps: ["run down sql"],
        strategy: "reversible-down",
        validationSteps: ["smoke preflight"],
      },
    ],
    migrationTags: ["0000_example"],
  });

  assert.match(validation.failures.join("\n"), /still require a verified backup/);
});
