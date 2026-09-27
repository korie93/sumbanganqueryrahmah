import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SystemMonitorNavigation } from "./SystemMonitorLayout";

test("System Monitor desktop exposes all permitted sections and the selected route", () => {
  const markup = renderToStaticMarkup(createElement(SystemMonitorNavigation, {
    activeSection: "analysis", availableSections: ["dashboard", "activity", "monitor", "analysis", "audit"],
    onSelect: () => undefined,
  }));
  assert.match(markup, /<nav[^>]*aria-label="System Monitor"/);
  for (const label of ["Dashboard Login", "Activity", "System Performance", "Analysis", "Audit Logs"]) {
    assert.ok(markup.includes(label), `${label} remains available`);
  }
  assert.equal((markup.match(/aria-current="page"/g) || []).length, 1);
  assert.match(markup, /aria-label="Change System Monitor section, current: Analysis"/);
});

test("System Monitor mobile launcher has one compact dialog trigger with current context", () => {
  const markup = renderToStaticMarkup(createElement(SystemMonitorNavigation, {
    activeSection: "activity", availableSections: ["activity"], onSelect: () => undefined,
  }));
  assert.equal((markup.match(/data-testid="button-monitor-sections"/g) || []).length, 1);
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-label="Change System Monitor section, current: Activity"/);
  assert.doesNotMatch(markup, /Audit Logs|System Performance|Dashboard Login|>Analysis</);
});

test("System Monitor hidden sections do not leak into the alternate navigation", () => {
  const markup = renderToStaticMarkup(createElement(SystemMonitorNavigation, {
    activeSection: "dashboard", availableSections: ["dashboard", "analysis"], onSelect: () => undefined,
  }));
  assert.match(markup, /Dashboard Login/);
  assert.match(markup, /Analysis/);
  assert.doesNotMatch(markup, /Audit Logs|System Performance|>Activity</);
});
