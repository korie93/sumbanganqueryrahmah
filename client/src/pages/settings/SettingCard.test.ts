import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingCard } from "@/pages/settings/SettingCard";
import type { SettingItem } from "@/pages/settings/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const textSetting: SettingItem = {
  key: "session_timeout_minutes",
  label: "Session timeout",
  description: "How long an inactive session can remain signed in before automatic logout.",
  type: "number",
  value: "15",
  defaultValue: "15",
  isCritical: false,
  updatedAt: null,
  permission: {
    canView: true,
    canEdit: true,
  },
  options: [],
};

const blankLabelSelectSetting: SettingItem = {
  key: "maintenance_type",
  label: "   ",
  description: "Choose the maintenance mode shown to signed-in operators.",
  type: "select",
  value: "soft",
  defaultValue: "soft",
  isCritical: true,
  updatedAt: null,
  permission: {
    canView: true,
    canEdit: false,
  },
  options: [
    { value: "soft", label: "Soft" },
    { value: "hard", label: "Hard" },
  ],
};

test("SettingCard links desktop controls to a hidden description instead of naming the decorative info icon", () => {
  const markup = renderToStaticMarkup(
    createElement(SettingCard, {
      setting: textSetting,
      value: textSetting.value,
      isDirty: false,
      saving: false,
      onChange: () => undefined,
    }),
  );

  assert.match(markup, /id="setting-card-title-session_timeout_minutes"/);
  assert.match(markup, /id="setting-card-description-session_timeout_minutes" class="sr-only"/);
  assert.match(markup, /aria-labelledby="setting-card-title-session_timeout_minutes"/);
  assert.match(markup, /aria-describedby="setting-card-description-session_timeout_minutes"/);
  assert.match(markup, /class="text-muted-foreground" title="How long an inactive session can remain signed in before automatic logout\." aria-hidden="true"/);
  assert.doesNotMatch(markup, /aria-label="How long an inactive session can remain signed in before automatic logout\." /);
});

test("SettingCard keeps switch and select controls described by the shared setting description", () => {
  const source = readFileSync(path.join(__dirname, "SettingCard.tsx"), "utf8");
  const selectSectionMatch = source.match(/if \(setting\.type === "select"\) \{[\s\S]*?return \([\s\S]*?<\/Select>\s*\);[\s\S]*?\}/);
  const selectSection = selectSectionMatch?.[0] ?? "";

  assert.match(source, /<Switch[\s\S]*aria-labelledby=\{settingTitleId\}[\s\S]*aria-describedby=\{settingDescriptionId\}/);
  assert.match(source, /const settingLabel = setting\.label\.trim\(\) \|\| humanizeSettingKey\(setting\.key\);/);
  assert.match(selectSection, /<SelectTrigger[\s\S]*aria-label=\{settingLabel\}[\s\S]*aria-describedby=\{settingDescriptionId\}/);
  assert.doesNotMatch(selectSection, /aria-labelledby=\{settingTitleId\}/);
  assert.doesNotMatch(source, /const actionHintAriaLabelProps/);
  assert.doesNotMatch(source, /\{\s*"aria-label": actionHint\s*\}/);
});

test("SettingCard falls back to a humanized key when a setting label is blank", () => {
  const markup = renderToStaticMarkup(
    createElement(SettingCard, {
      setting: blankLabelSelectSetting,
      value: blankLabelSelectSetting.value,
      isDirty: false,
      saving: false,
      onChange: () => undefined,
    }),
  );

  assert.match(markup, />Maintenance Type<\/h3>/);
  assert.match(markup, /aria-label="Maintenance Type"/);
  assert.match(markup, /aria-describedby="setting-card-description-maintenance_type"/);
});
