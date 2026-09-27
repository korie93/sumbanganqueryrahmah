import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionReportFreshnessBadge } from "./CollectionReportFreshnessBadge";
import { getCollectionRollupFreshnessStatus } from "@/lib/collection-rollup-freshness";

test("freshness badges retain explicit status and use readable semantic colors in both themes", () => {
  for (const [status, label, token] of [["fresh", "Fresh", "success"], ["warming", "Updating", "warning"], ["stale", "Stale", "destructive"]] as const) {
    const markup = renderToStaticMarkup(createElement(CollectionReportFreshnessBadge, {
      freshness: { status, pendingCount: 0, runningCount: 0, retryCount: 0, oldestPendingAgeMs: 0, message: "Rollup detail" },
    }));
    assert.ok(markup.includes(`text-${token}`));
    assert.ok(markup.includes(`bg-${token}/10`));
    assert.ok(markup.includes(`>${label}</div>`));
    assert.match(markup, /title="Rollup detail"/);
    assert.doesNotMatch(markup, /text-(?:emerald|amber|red)-500/);
  }
  assert.equal(renderToStaticMarkup(createElement(CollectionReportFreshnessBadge, { freshness: null })), "");
});

test("freshness presentation retains the existing queue and age thresholds", () => {
  const fresh = { pendingCount: 0, retryCount: 0, oldestPendingAgeMs: 0 };
  assert.equal(getCollectionRollupFreshnessStatus(fresh), "fresh");
  assert.equal(getCollectionRollupFreshnessStatus({ ...fresh, pendingCount: 1 }), "warming");
  assert.equal(getCollectionRollupFreshnessStatus({ ...fresh, oldestPendingAgeMs: 30_000 }), "warming");
  for (const update of [{ pendingCount: 15 }, { retryCount: 1 }, { oldestPendingAgeMs: 120_000 }]) {
    assert.equal(getCollectionRollupFreshnessStatus({ ...fresh, ...update }), "stale");
  }
});
