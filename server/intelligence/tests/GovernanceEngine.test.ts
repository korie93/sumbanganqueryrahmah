import test from "node:test";
import assert from "node:assert/strict";
import { GovernanceEngine, GovernanceState } from "../governance/GovernanceEngine";

test("Governance cooldown logic enforces minimum 60 seconds", () => {
  const engine = new GovernanceEngine();
  const start = 1_000_000;

  assert.equal(
    engine.update({ severity: "CRITICAL", recommendedAction: "ENABLE_THROTTLE_MODE" }, start),
    GovernanceState.PROPOSED,
  );
  assert.equal(
    engine.update({ severity: "CRITICAL", recommendedAction: "ENABLE_THROTTLE_MODE" }, start + 6_000),
    GovernanceState.CONSENSUS_PENDING,
  );
  assert.equal(
    engine.update(
      { severity: "CRITICAL", recommendedAction: "ENABLE_THROTTLE_MODE", consensusApproved: true },
      start + 12_000,
    ),
    GovernanceState.EXECUTED,
  );
  assert.equal(
    engine.update({ severity: "CRITICAL", recommendedAction: "ENABLE_THROTTLE_MODE" }, start + 18_000),
    GovernanceState.COOLDOWN,
  );
  assert.equal(
    engine.update({ severity: "NORMAL", recommendedAction: "NONE" }, start + 50_000),
    GovernanceState.COOLDOWN,
  );
  assert.equal(
    engine.update({ severity: "NORMAL", recommendedAction: "NONE" }, start + 85_000),
    GovernanceState.IDLE,
  );
});

test("Governance oscillation prevention blocks rapid back and forth", () => {
  const engine = new GovernanceEngine();
  const start = 2_000_000;

  assert.equal(
    engine.update({ severity: "WARNING", recommendedAction: "ENABLE_THROTTLE_MODE" }, start),
    GovernanceState.PROPOSED,
  );

  const guarded = engine.update({ severity: "NORMAL", recommendedAction: "NONE" }, start + 1_000);
  assert.equal(guarded, GovernanceState.PROPOSED);
});

