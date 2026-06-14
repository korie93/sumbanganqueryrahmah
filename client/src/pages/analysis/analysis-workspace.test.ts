import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalysisWorkspaceLocation,
  isAnalysisWorkspaceSection,
  resolveAnalysisWorkspaceSection,
} from "@/pages/analysis/analysis-workspace";

test("analysis workspace accepts only known section values", () => {
  assert.equal(isAnalysisWorkspaceSection("overview"), true);
  assert.equal(isAnalysisWorkspaceSection("issues"), true);
  assert.equal(isAnalysisWorkspaceSection("admin"), false);
  assert.equal(isAnalysisWorkspaceSection("<script>"), false);
  assert.equal(isAnalysisWorkspaceSection(null), false);
});

test("analysis workspace resolves invalid URL input to overview", () => {
  assert.equal(
    resolveAnalysisWorkspaceSection(
      "/monitor?section=analysis&analysisView=quality",
    ),
    "quality",
  );
  assert.equal(
    resolveAnalysisWorkspaceSection(
      "/monitor?section=analysis&analysisView=%3Cscript%3E",
    ),
    "overview",
  );
  assert.equal(resolveAnalysisWorkspaceSection("not a valid URL%"), "overview");
});

test("analysis workspace location preserves the monitor route and query", () => {
  assert.equal(
    buildAnalysisWorkspaceLocation(
      "/monitor?section=analysis&source=saved#content",
      "compare",
    ),
    "/monitor?section=analysis&source=saved&analysisView=compare#content",
  );
  assert.equal(
    buildAnalysisWorkspaceLocation(
      "/monitor?section=analysis&analysisView=overview",
      "trends",
    ),
    "/monitor?section=analysis&analysisView=trends",
  );
});
