import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySourceType,
  extractTableNames,
  formatSchemaGovernanceReport,
  validateSchemaGovernance,
} from "../lib/db-schema-governance.mjs";

test("extractTableNames discovers pgTable, create table, and alter table definitions", () => {
  const sourceText = `
    export const auditLogs = pgTable("audit_logs", {});
    CREATE TABLE IF NOT EXISTS public.banned_sessions (id text primary key);
    ALTER TABLE public.banned_sessions ADD COLUMN IF NOT EXISTS fingerprint text;
  `;

  assert.deepEqual(extractTableNames(sourceText), ["audit_logs", "banned_sessions"]);
});

test("classifySourceType maps repository paths to governance source types", () => {
  assert.equal(classifySourceType("shared/schema-postgres.ts"), "drizzle-schema");
  assert.equal(classifySourceType("drizzle/0001_example.sql"), "drizzle-migration");
  assert.equal(classifySourceType("server/sql/20260306_collection_report.sql"), "legacy-sql");
  assert.equal(classifySourceType("server/internal/coreSchemaBootstrap.ts"), "runtime-ddl");
  assert.equal(classifySourceType("scripts/import-aeon-branches.mjs"), "maintenance-script");
});

test("validateSchemaGovernance rejects unmanaged tables and missing reviewed migrations", () => {
  const discoveredTables = new Map([
    [
      "banned_sessions",
      {
        table: "banned_sessions",
        sourceTypes: ["drizzle-schema", "runtime-ddl"],
        sourceFiles: ["shared/schema-postgres.ts", "server/internal/coreSchemaBootstrap.ts"],
      },
    ],
    [
      "mystery_table",
      {
        table: "mystery_table",
        sourceTypes: ["runtime-ddl"],
        sourceFiles: ["server/internal/unknownBootstrap.ts"],
      },
    ],
  ]);

  const manifest = {
    tables: {
      banned_sessions: {
        authority: "drizzle-schema",
        mode: "drizzle-reviewed",
        allowedSources: ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      },
    },
  };

  const validation = validateSchemaGovernance({ discoveredTables, manifest });

  assert.match(validation.failures.join("\n"), /banned_sessions.+missing a reviewed Drizzle SQL migration/i);
  assert.match(validation.failures.join("\n"), /mystery_table.+not declared/i);
});

test("formatSchemaGovernanceReport summarizes successful checks", () => {
  const discoveredTables = new Map([
    [
      "system_stability_patterns",
      {
        table: "system_stability_patterns",
        sourceTypes: ["runtime-ddl"],
        sourceFiles: ["server/intelligence/learning/StabilityDnaEngine.ts"],
      },
    ],
  ]);

  const manifest = {
    tables: {
      system_stability_patterns: {
        authority: "runtime-ddl",
        mode: "runtime-managed",
        allowedSources: ["runtime-ddl"],
      },
    },
  };

  const validation = validateSchemaGovernance({ discoveredTables, manifest });
  const report = formatSchemaGovernanceReport({ discoveredTables, manifest, validation });

  assert.equal(validation.failures.length, 0);
  assert.match(report, /runtime-managed: 1/);
  assert.match(report, /All discovered tables are classified/);
});
