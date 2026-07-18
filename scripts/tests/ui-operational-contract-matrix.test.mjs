import assert from "node:assert/strict";
import test from "node:test";
import {
  operationalContractRouteSpecs,
  operationalStressViewportSpecs,
} from "../lib/ui-operational-contract-matrix.mjs";

const expectedRouteIds = [
  "import",
  "saved",
  "activity",
  "analysis",
  "audit-logs",
  "backup-restore",
];

test("operational UI contract matrix covers the high-risk data workspaces", () => {
  assert.deepEqual(
    operationalContractRouteSpecs.map((routeSpec) => routeSpec.id),
    expectedRouteIds,
  );

  assert.equal(
    new Set(operationalContractRouteSpecs.map((routeSpec) => routeSpec.path)).size,
    operationalContractRouteSpecs.length,
  );
});

test("operational UI routes define stable readiness and bounded stress viewports", () => {
  for (const routeSpec of operationalContractRouteSpecs) {
    assert.match(routeSpec.path, /^\//);
    assert.ok(routeSpec.contentSelector);
    assert.ok(routeSpec.readySelector);

    const viewportSpec = operationalStressViewportSpecs[routeSpec.stressViewportId];
    assert.ok(viewportSpec, `${routeSpec.id} should reference a known stress viewport`);
    assert.ok(viewportSpec.width >= 320 && viewportSpec.width <= 1920);
    assert.ok(viewportSpec.height >= 568 && viewportSpec.height <= 1080);
    if (viewportSpec.rootFontSizePx !== undefined) {
      assert.ok(viewportSpec.rootFontSizePx >= 16 && viewportSpec.rootFontSizePx <= 32);
    }
  }
});

test("saved route readiness accepts populated and empty terminal states", () => {
  const savedRouteSpec = operationalContractRouteSpecs.find((routeSpec) => routeSpec.id === "saved");

  assert.ok(savedRouteSpec);
  assert.match(savedRouteSpec.readySelector, /text-import-count/);
  assert.match(savedRouteSpec.readySelector, /button-import-new/);
  assert.match(savedRouteSpec.readySelector, /button-clear-filters-empty/);
  assert.match(savedRouteSpec.readySelector, /saved-files-scroll-region/);
});
