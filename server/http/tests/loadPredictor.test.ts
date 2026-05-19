import assert from "node:assert/strict";
import test from "node:test";

import { LoadPredictor } from "../../internal/loadPredictor";

test("LoadPredictor keeps the newest samples in a bounded circular buffer", () => {
  const predictor = new LoadPredictor({
    longWindowSec: 120,
    maxSamples: 30,
    shortWindowSec: 60,
  });
  const now = Date.now();

  for (let index = 0; index < 45; index += 1) {
    predictor.update({
      ts: now - 1_000 + index,
      cpuPercent: index,
      latencyP95Ms: index,
      requestRate: index,
    });
  }

  const snapshot = predictor.getSnapshot();
  const newestThirtyAverage = (15 + 44) / 2;

  assert.equal(snapshot.lastUpdatedAt, now - 1_000 + 44);
  assert.equal(snapshot.requestRateMA, newestThirtyAverage);
  assert.equal(snapshot.latencyMA, newestThirtyAverage);
  assert.equal(snapshot.cpuMA, newestThirtyAverage);
});
