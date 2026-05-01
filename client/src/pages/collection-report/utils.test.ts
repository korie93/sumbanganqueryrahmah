import assert from "node:assert/strict";
import test from "node:test";
import { getPathForSubPage, getSubPageFromPath } from "@/pages/collection-report/utils";

test("collection report utils resolve the monthly comparison subpage path", () => {
  assert.equal(
    getSubPageFromPath("/collection/monthly-comparison"),
    "monthly-comparison",
  );
  assert.equal(
    getPathForSubPage("monthly-comparison"),
    "/collection/monthly-comparison",
  );
});

