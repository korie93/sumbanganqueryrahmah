import assert from "node:assert/strict";
import test from "node:test";
import { ensureSettingsSchema } from "../settings-bootstrap-schema";
import type { SettingsBootstrapSqlExecutor } from "../settings-bootstrap-shared";

function flattenSqlChunk(chunk: unknown): string {
  if (chunk === null || chunk === undefined) {
    return "";
  }
  if (typeof chunk === "string") {
    return chunk;
  }
  if (Array.isArray(chunk)) {
    return chunk.map((item) => flattenSqlChunk(item)).join("");
  }
  if (typeof chunk === "object") {
    const value = (chunk as { value?: unknown; queryChunks?: unknown[] }).value;
    if (value !== undefined) {
      return flattenSqlChunk(value);
    }

    const queryChunks = (chunk as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(queryChunks)) {
      return queryChunks.map((item) => flattenSqlChunk(item)).join("");
    }
  }

  return "";
}

function normalizeSqlText(query: unknown): string {
  return flattenSqlChunk(query).replace(/\s+/g, " ").trim();
}

test("settings bootstrap enforces reviewed foreign keys as not null after legacy cleanup", async () => {
  const executedQueries: string[] = [];
  const executor = {
    execute: ((query: unknown) => {
      executedQueries.push(normalizeSqlText(query));
      return { rows: [] } as unknown as ReturnType<SettingsBootstrapSqlExecutor["execute"]>;
    }) as SettingsBootstrapSqlExecutor["execute"],
  } satisfies SettingsBootstrapSqlExecutor;

  await ensureSettingsSchema(executor);

  const joinedQueries = executedQueries.join("\n");
  assert.match(joinedQueries, /category_id uuid NOT NULL REFERENCES public\.setting_categories\(id\) ON DELETE CASCADE/);
  assert.match(joinedQueries, /setting_id uuid NOT NULL REFERENCES public\.system_settings\(id\) ON DELETE CASCADE/);

  const settingOptionCleanupIndex = executedQueries.findIndex((query) =>
    query.includes("DELETE FROM public.setting_options so WHERE so.setting_id IS NULL"),
  );
  const settingOptionNotNullIndex = executedQueries.findIndex((query) =>
    query.includes("ALTER TABLE public.setting_options ALTER COLUMN setting_id SET NOT NULL"),
  );
  const systemSettingsCleanupIndex = executedQueries.findIndex((query) =>
    query.includes("DELETE FROM public.system_settings s WHERE s.category_id IS NULL"),
  );
  const systemSettingsNotNullIndex = executedQueries.findIndex((query) =>
    query.includes("ALTER TABLE public.system_settings ALTER COLUMN category_id SET NOT NULL"),
  );

  assert.ok(settingOptionCleanupIndex >= 0);
  assert.ok(settingOptionNotNullIndex > settingOptionCleanupIndex);
  assert.ok(systemSettingsCleanupIndex >= 0);
  assert.ok(systemSettingsNotNullIndex > systemSettingsCleanupIndex);
});
