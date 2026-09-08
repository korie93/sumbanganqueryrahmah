import assert from "node:assert/strict";
import test from "node:test";
import { createRoleTabVisibilityCache } from "../guard-tab-visibility";
import { subscribeRolePermissionInvalidation } from "../role-permission-shared-invalidation";
import type { RuntimeWsSharedBus, RuntimeWsSharedBusEvent } from "../../ws/runtime-shared-bus";

test("an in-flight stale permission read is discarded after scoped invalidation", async () => {
  let finishOldRead: (value: Record<string, boolean>) => void = () => {};
  const calls: string[] = [];
  const cache = createRoleTabVisibilityCache({ storage: {
    async getRoleTabVisibility(role) {
      calls.push(role);
      if (role === "manager" && calls.filter((entry) => entry === role).length === 1) {
        return new Promise((resolve) => { finishOldRead = resolve; });
      }
      return { activity: false };
    },
  } });
  try {
    await cache.getRoleTabVisibilityCached("user");
    const stale = cache.getRoleTabVisibilityCached("manager");
    cache.clear("manager");
    finishOldRead({ activity: true });
    assert.deepEqual(await stale, { activity: false });
    await cache.getRoleTabVisibilityCached("manager");
    await cache.getRoleTabVisibilityCached("user");
    assert.deepEqual(calls, ["user", "manager", "manager"]);
  } finally { cache.stop(); }
});

test("shared-worker role notifications invalidate only the affected cached role and unsubscribe cleanly", () => {
  let callback: ((event: RuntimeWsSharedBusEvent) => void) | undefined;
  const bus = { subscribe(handler: typeof callback) { callback = handler; return () => { callback = undefined; }; } } as unknown as RuntimeWsSharedBus;
  const cleared: (string | undefined)[] = [];
  const stop = subscribeRolePermissionInvalidation(bus, (role) => cleared.push(role));
  const send = (key: string) => callback?.({ type: "broadcast", id: "test", originId: "another-worker", payload: { type: "settings_updated", key } });
  send("tab_manager_activity_enabled");
  send("system_name");
  send("canViewSystemPerformance");
  assert.deepEqual(cleared, ["manager", "admin"]);
  stop();
  send("tab_user_import_enabled");
  assert.equal(cleared.length, 2);
});
