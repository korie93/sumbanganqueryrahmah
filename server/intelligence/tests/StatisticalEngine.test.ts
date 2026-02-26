import test from "node:test";
import assert from "node:assert/strict";
import { StatisticalEngine } from "../statistical/StatisticalEngine";

test("Slope accuracy for linear increasing series", () => {
  const stats = new StatisticalEngine();
  const slope = stats.computeSlope([1, 2, 3, 4, 5, 6]);
  assert.ok(Math.abs(slope - 1) < 0.0001);
});

test("Z-score correctness", () => {
  const stats = new StatisticalEngine();
  const z = stats.computeZScore(12, 10, 2);
  assert.ok(Math.abs(z - 1) < 0.0001);
});

