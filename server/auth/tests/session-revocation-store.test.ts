import assert from "node:assert/strict";
import test from "node:test";
import {
  configureSessionRevocationStoreForRuntime,
  getSessionRevocationStoreDiagnosticsForTests,
  isSessionJwtRevoked,
  resetSessionRevocationStoreForTests,
  revokeSessionJwt,
  sweepSessionRevocationStoreForTests,
} from "../session-revocation-store";

test.beforeEach(() => {
  resetSessionRevocationStoreForTests();
});

test.after(() => {
  resetSessionRevocationStoreForTests();
});

test("memory session revocation store rejects revoked JWT ids until they expire", async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);

  await revokeSessionJwt({
    jwtId: "jwt-1",
    expiresAtMs: now + 1_000,
  });

  assert.equal(await isSessionJwtRevoked("jwt-1"), true);
  assert.equal(await isSessionJwtRevoked("jwt-2"), false);

  now += 1_001;

  assert.equal(await isSessionJwtRevoked("jwt-1"), false);
});

test("memory session revocation store ignores blank JWT ids", async () => {
  await revokeSessionJwt({
    jwtId: "   ",
    expiresAtMs: Date.now() + 1_000,
  });

  assert.equal(await isSessionJwtRevoked("   "), false);
  assert.equal(await isSessionJwtRevoked(null), false);
});

test("memory session revocation store keeps one active sweep owner across repeated resets", () => {
  for (let index = 0; index < 10; index += 1) {
    resetSessionRevocationStoreForTests();
  }

  assert.deepEqual(getSessionRevocationStoreDiagnosticsForTests(), {
    activeMemoryStores: 1,
    sweepActive: true,
    sweepInProgress: false,
  });
});

test("memory session revocation store starts one singleton sweep interval", (t) => {
  const noopStore = {
    isRevoked: async () => false,
    revoke: async () => undefined,
  };
  configureSessionRevocationStoreForRuntime(noopStore);
  assert.deepEqual(getSessionRevocationStoreDiagnosticsForTests(), {
    activeMemoryStores: 0,
    sweepActive: false,
    sweepInProgress: false,
  });

  const intervalHandle = {
    unref() {
      return this;
    },
  } as unknown as ReturnType<typeof setInterval>;
  const setIntervalMock = t.mock.method(
    globalThis,
    "setInterval",
    (((_handler: TimerHandler, delay?: number) => {
      assert.equal(delay, 5 * 60 * 1000);
      return intervalHandle;
    }) as unknown) as typeof setInterval,
  );
  const clearIntervalMock = t.mock.method(
    globalThis,
    "clearInterval",
    (((handle?: Parameters<typeof clearInterval>[0]) => {
      assert.equal(handle, intervalHandle);
    }) as unknown) as typeof clearInterval,
  );

  try {
    for (let index = 0; index < 10; index += 1) {
      resetSessionRevocationStoreForTests();
    }

    assert.equal(setIntervalMock.mock.callCount(), 1);
    assert.deepEqual(getSessionRevocationStoreDiagnosticsForTests(), {
      activeMemoryStores: 1,
      sweepActive: true,
      sweepInProgress: false,
    });

    configureSessionRevocationStoreForRuntime(noopStore);
    assert.equal(clearIntervalMock.mock.callCount(), 1);
    assert.deepEqual(getSessionRevocationStoreDiagnosticsForTests(), {
      activeMemoryStores: 0,
      sweepActive: false,
      sweepInProgress: false,
    });
  } finally {
    resetSessionRevocationStoreForTests();
  }
});

test("memory session revocation singleton sweep removes expired entries", async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);

  await revokeSessionJwt({
    jwtId: "jwt-swept",
    expiresAtMs: now + 1_000,
  });

  assert.equal(await isSessionJwtRevoked("jwt-swept"), true);
  now += 1_001;
  sweepSessionRevocationStoreForTests(now);

  assert.equal(await isSessionJwtRevoked("jwt-swept"), false);
});
