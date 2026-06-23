import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const analysisSource = readFileSync(
  new URL("../Analysis.tsx", import.meta.url),
  "utf8",
);
const contentSource = readFileSync(
  new URL("./AnalysisWorkspaceContent.tsx", import.meta.url),
  "utf8",
);
const navigationSource = readFileSync(
  new URL("./AnalysisWorkspaceNavigation.tsx", import.meta.url),
  "utf8",
);
const navigationHookSource = readFileSync(
  new URL("./useAnalysisWorkspaceNavigation.ts", import.meta.url),
  "utf8",
);

test("analysis workspace mounts content through one active section switch", () => {
  assert.match(analysisSource, /<AnalysisWorkspaceContent/);
  assert.match(analysisSource, /isMobileViewportWidth\(window\.innerWidth\)/);
  assert.doesNotMatch(analysisSource, /<AnalysisChartsSection/);
  assert.doesNotMatch(analysisSource, /<AnalysisDetailsSection/);
  assert.match(contentSource, /activeSection === "overview"/);
  assert.match(contentSource, /activeSection === "quality"/);
  assert.match(contentSource, /activeSection === "compare"/);
  assert.match(contentSource, /activeSection === "trends"/);
  assert.match(contentSource, /useDeferredAnalysisSectionMount/);
  assert.match(contentSource, /trendsSection\.shouldRender/);
  assert.match(contentSource, /issuesSection\.shouldRender/);
});

test("analysis workspace navigation remains accessible and bounded", () => {
  assert.match(navigationSource, /aria-label="Analysis sections"/);
  assert.match(navigationSource, /getAriaCurrentPageProps\(active\)/);
  assert.match(navigationSource, /const collapsedItemLabelProps = collapsed \? \{ "aria-label": item\.label \} : \{\};/);
  assert.match(navigationSource, /\{\.\.\.collapsedItemLabelProps\}/);
  assert.doesNotMatch(navigationSource, /aria-current=\{[^}]+\}/);
  assert.doesNotMatch(navigationSource, /aria-label=\{collapsed \? item\.label : undefined\}/);
  assert.match(navigationSource, /Collapse analysis sidebar/);
  assert.doesNotMatch(navigationSource, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(navigationSource, /setInterval|setTimeout|addEventListener/);
  assert.match(navigationHookSource, /useSearch\(\)/);
  assert.match(
    navigationHookSource,
    /`\$\{pathname\}\$\{search \? `\?\$\{search\}` : ""\}`/,
  );
});

test("analysis workspace orchestration stays split into small modules", () => {
  const files = [
    ["Analysis.tsx", analysisSource],
    ["AnalysisWorkspaceContent.tsx", contentSource],
    ["AnalysisWorkspaceNavigation.tsx", navigationSource],
  ] as const;

  for (const [name, source] of files) {
    assert.ok(
      source.split(/\r?\n/).length <= 180,
      `${name} should stay at or below 180 lines`,
    );
  }
});
