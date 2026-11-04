import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import { MaintenanceSettingsNotice } from "./MaintenanceSettingsNotice";
import type { MaintenanceSettingsSummary } from "./maintenance-settings-summary";

const scheduled: MaintenanceSettingsSummary = {
  enabled: true, mode: "soft", startTime: "2026-11-20T12:00:00.000Z", endTime: "2026-11-21T12:00:00.000Z",
  status: "scheduled", title: "Maintenance is scheduled for a future window",
  description: "The toggle is on, but the configured start time has not been reached yet.",
};

function render(summary = scheduled, currentUserRole = "superuser") {
  return renderToStaticMarkup(createElement(MaintenanceSettingsNotice, { summary, currentUserRole }));
}

test("maintenance keeps its full prose, dates and reading order inside its scoped summary", () => {
  const markup = render();
  assert.match(markup, /class="ops-summary-strip maintenance-settings-summary"/);
  assert.deepEqual([...markup.matchAll(/<p class="ops-metric-label">([^<]+)<\/p>/g)].map((match) => match[1]),
    ["Status", "Mode", "Start time", "End time"]);
  assert.ok(markup.includes(scheduled.title));
  assert.ok(markup.includes(scheduled.description));
  assert.ok(markup.includes(formatDateTimeDDMMYYYY(scheduled.startTime)));
  assert.ok(markup.includes(formatDateTimeDDMMYYYY(scheduled.endTime)));
  assert.match(markup, /Only Search, Imports, and AI APIs are blocked\./);
  assert.match(markup, /This role bypasses maintenance enforcement by design\./);
  assert.doesNotMatch(markup, /truncate|line-clamp|<button\b/);
});

test("maintenance fallbacks and role explanations remain truthful across inactive and hard states", () => {
  const inactive = render({
    ...scheduled, enabled: false, status: "inactive", startTime: null, endTime: null,
    title: "Maintenance is currently inactive",
    description: "The master switch is off, so protected routes continue running normally.",
  }, "user");
  assert.match(inactive, /Maintenance is currently inactive/);
  assert.match(inactive, /Immediate/);
  assert.match(inactive, /Until switched off/);
  assert.match(inactive, /This role should experience maintenance restrictions when the window is active\./);

  const hard = render({ ...scheduled, mode: "hard", status: "active-hard", title: "Hard maintenance is active" });
  assert.match(hard, /Hard active/);
  assert.match(hard, /Hard maintenance is active/);
  assert.match(hard, /Protected routes redirect standard users to \/maintenance\./);
});

test("maintenance prose reflows locally without changing the shared numeric metric treatment", () => {
  const css = readFileSync(new URL("./MaintenanceSettingsNotice.css", import.meta.url), "utf8");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  assert.ok(rules.length > 0);
  for (const rule of rules) {
    assert.ok(rule[1]!.includes("maintenance-settings-summary"), "Every declaration stays scoped to maintenance");
  }
  assert.match(css, /\.ops-summary-strip\.maintenance-settings-summary\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(css, /@media\s*\(min-width:\s*640px\)[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.maintenance-settings-summary \.ops-metric-value\s*\{[^}]*font-size:\s*var\(--font-size-base\);[^}]*line-height:\s*var\(--line-height-normal\);[^}]*overflow-wrap:\s*normal;/);
  const sharedCss = readFileSync(new URL("../../app/AuthenticatedAppShell.css", import.meta.url), "utf8");
  assert.match(sharedCss, /\.ops-metric-value\s*\{[^}]*font-size:\s*var\(--font-size-xl\);[^}]*overflow-wrap:\s*anywhere;/);
  const page = readFileSync(new URL("../Settings.tsx", import.meta.url), "utf8");
  assert.match(page, /import "@\/pages\/settings\/MaintenanceSettingsNotice\.css";/);
});
