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
  assert.match(joinedQueries, /category_id uuid NOT NULL REFERENCES public\.setting_categories\(id\) ON DELETE CASCADE ON UPDATE CASCADE/);
  assert.match(joinedQueries, /setting_id uuid NOT NULL REFERENCES public\.system_settings\(id\) ON DELETE CASCADE ON UPDATE CASCADE/);

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
  const systemSettingsForeignKeyUpdateIndex = executedQueries.findIndex((query) =>
    query.includes("ADD CONSTRAINT fk_system_settings_category_id FOREIGN KEY (category_id) REFERENCES public.setting_categories(id) ON DELETE CASCADE ON UPDATE CASCADE"),
  );
  const settingOptionsForeignKeyUpdateIndex = executedQueries.findIndex((query) =>
    query.includes("ADD CONSTRAINT fk_setting_options_setting_id FOREIGN KEY (setting_id) REFERENCES public.system_settings(id) ON DELETE CASCADE ON UPDATE CASCADE"),
  );

  assert.ok(settingOptionCleanupIndex >= 0);
  assert.ok(settingOptionNotNullIndex > settingOptionCleanupIndex);
  assert.ok(systemSettingsCleanupIndex >= 0);
  assert.ok(systemSettingsNotNullIndex > systemSettingsCleanupIndex);
  assert.ok(systemSettingsForeignKeyUpdateIndex > systemSettingsNotNullIndex);
  assert.ok(settingOptionsForeignKeyUpdateIndex > settingOptionNotNullIndex);
});

test("settings bootstrap backfills timestamp defaults before enforcing not null", async () => {
  const executedQueries: string[] = [];
  const executor = {
    execute: ((query: unknown) => {
      executedQueries.push(normalizeSqlText(query));
      return { rows: [] } as unknown as ReturnType<SettingsBootstrapSqlExecutor["execute"]>;
    }) as SettingsBootstrapSqlExecutor["execute"],
  } satisfies SettingsBootstrapSqlExecutor;

  await ensureSettingsSchema(executor);

  const joinedQueries = executedQueries.join("\n");
  assert.match(joinedQueries, /created_at timestamp with time zone DEFAULT now\(\) NOT NULL/);
  assert.match(joinedQueries, /updated_at timestamp with time zone DEFAULT now\(\) NOT NULL/);
  assert.match(joinedQueries, /changed_at timestamp with time zone DEFAULT now\(\) NOT NULL/);

  const categoryBackfillIndex = executedQueries.findIndex((query) =>
    query.includes("UPDATE public.setting_categories SET created_at = COALESCE(created_at, now())"),
  );
  const categoryNotNullIndex = executedQueries.findIndex((query) =>
    query.includes("ALTER TABLE public.setting_categories ALTER COLUMN created_at SET NOT NULL"),
  );
  const settingBackfillIndex = executedQueries.findIndex((query) =>
    query.includes("UPDATE public.system_settings SET updated_at = COALESCE(updated_at, now())"),
  );
  const settingNotNullIndex = executedQueries.findIndex((query) =>
    query.includes("ALTER TABLE public.system_settings ALTER COLUMN updated_at SET NOT NULL"),
  );
  const versionBackfillIndex = executedQueries.findIndex((query) =>
    query.includes("UPDATE public.setting_versions SET changed_at = COALESCE(changed_at, now())"),
  );
  const versionNotNullIndex = executedQueries.findIndex((query) =>
    query.includes("ALTER TABLE public.setting_versions ALTER COLUMN changed_at SET NOT NULL"),
  );
  const featureFlagBackfillIndex = executedQueries.findIndex((query) =>
    query.includes("UPDATE public.feature_flags SET updated_at = COALESCE(updated_at, now())"),
  );
  const featureFlagNotNullIndex = executedQueries.findIndex((query) =>
    query.includes("ALTER TABLE public.feature_flags ALTER COLUMN updated_at SET NOT NULL"),
  );

  assert.ok(categoryBackfillIndex >= 0);
  assert.ok(categoryNotNullIndex > categoryBackfillIndex);
  assert.ok(settingBackfillIndex >= 0);
  assert.ok(settingNotNullIndex > settingBackfillIndex);
  assert.ok(versionBackfillIndex >= 0);
  assert.ok(versionNotNullIndex > versionBackfillIndex);
  assert.ok(featureFlagBackfillIndex >= 0);
  assert.ok(featureFlagNotNullIndex > featureFlagBackfillIndex);
});
