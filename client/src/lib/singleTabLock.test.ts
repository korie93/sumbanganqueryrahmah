import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { SingleTabLock } from "./singleTabLock";

type RequestOptions = { mode: "exclusive"; ifAvailable: true };
type LockCallback = (lock: Lock | null) => Promise<void>;

/** Models a browser profile's shared lock table, including callback lifetime. */
class BrowserProfileLocks {
  readonly held = new Set<string>();
  readonly requests: Array<{ name: string; options: RequestOptions }> = [];

  request = (name: string, options: RequestOptions, callback: LockCallback): Promise<void> => {
    this.requests.push({ name, options });
    return Promise.resolve().then(async () => {
      if (this.held.has(name)) {
        await callback(null);
        return;
      }
      this.held.add(name);
      try {
        await callback({ name, mode: "exclusive" } as Lock);
      } finally {
        this.held.delete(name);
      }
    });
  };
}

const navigatorRestorations = new WeakSet<TestContext>();

function installNavigator(t: TestContext, value: unknown): void {
  if (!navigatorRestorations.has(t)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    navigatorRestorations.add(t);
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
      else Reflect.deleteProperty(globalThis, "navigator");
    });
  }
  Object.defineProperty(globalThis, "navigator", { configurable: true, value });
}

async function settleBrowserCallbacks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("account IDs have a stable namespace and missing or unsafe IDs fail closed", () => {
  assert.equal(new SingleTabLock(" backend-account-42 ").name, "sqr:active-tab:v1:backend-account-42");
  assert.equal(new SingleTabLock(42).name, new SingleTabLock("42").name);
  for (const id of ["", "  ", "undefined", "null", null, undefined, {}, true, NaN, Infinity, 1.5]) {
    assert.throws(() => new SingleTabLock(id as string), /ID akaun yang sah/);
  }
});

test("same account in two tabs has only one active owner and blocked tabs do not queue", async (t) => {
  const locks = new BrowserProfileLocks();
  installNavigator(t, { locks });
  const original = new SingleTabLock("account-1");
  const additional = new SingleTabLock("account-1");
  t.after(() => { original.release(); additional.release(); });

  const outcomes = await Promise.all([original.tryAcquire(), additional.tryAcquire()]);
  assert.deepEqual(outcomes, ["active", "blocked"]);
  assert.equal(original.active, true);
  assert.equal(additional.active, false);
  assert.equal(locks.held.size, 1);
  assert.deepEqual(locks.requests[0].options, { mode: "exclusive", ifAvailable: true });

  original.release();
  assert.equal(original.active, false, "unmount ownership stops synchronously");
  await settleBrowserCallbacks();
  assert.equal(additional.active, false, "ownership never transfers without explicit recheck");
  assert.equal(await additional.tryAcquire(), "active");
  assert.equal(additional.active, true);
});

test("different authenticated account IDs use independent atomic locks", async (t) => {
  const locks = new BrowserProfileLocks();
  installNavigator(t, { locks });
  const left = new SingleTabLock("account-1");
  const right = new SingleTabLock("account-2");
  t.after(() => { left.release(); right.release(); });
  assert.deepEqual(await Promise.all([left.tryAcquire(), right.tryAcquire()]), ["active", "active"]);
  assert.equal(locks.held.size, 2);
});

test("closing a blocked tab does not release or interfere with the original account owner", async (t) => {
  const locks = new BrowserProfileLocks();
  installNavigator(t, { locks });
  const original = new SingleTabLock("account-1");
  const blocked = new SingleTabLock("account-1");
  t.after(() => original.release());
  assert.equal(await original.tryAcquire(), "active");
  assert.equal(await blocked.tryAcquire(), "blocked");
  blocked.release();
  await settleBrowserCallbacks();
  assert.equal(original.active, true);
  assert.equal(locks.held.has(original.name), true);
  assert.equal(await new SingleTabLock("account-1").tryAcquire(), "blocked");
});

test("concurrent rechecks coalesce and repeated active acquisition does not create another request", async (t) => {
  const locks = new BrowserProfileLocks();
  installNavigator(t, { locks });
  const controller = new SingleTabLock("account-1");
  t.after(() => controller.release());
  const first = controller.tryAcquire();
  const second = controller.tryAcquire();
  assert.equal(first, second);
  assert.equal(await first, "active");
  assert.equal(await controller.tryAcquire(), "active");
  assert.equal(locks.requests.length, 1);
});

test("release is terminal and idempotent without notifying unexpected ownership loss", async (t) => {
  const locks = new BrowserProfileLocks();
  installNavigator(t, { locks });
  let losses = 0;
  const controller = new SingleTabLock("account-1", { onOwnershipLost: () => { losses += 1; } });
  assert.equal(await controller.tryAcquire(), "active");
  controller.release();
  controller.release();
  assert.equal(controller.disposed, true);
  assert.equal(controller.active, false);
  assert.equal(await controller.tryAcquire(), "error");
  await settleBrowserCallbacks();
  assert.equal(locks.held.size, 0);
  assert.equal(losses, 0);
});

test("release during a pending request settles immediately and a late grant is never activated", async (t) => {
  let callback!: LockCallback;
  installNavigator(t, {
    locks: { request: (_name: string, _options: RequestOptions, next: LockCallback) => {
      callback = next;
      return new Promise<void>(() => {});
    } },
  });
  const controller = new SingleTabLock("account-1");
  const pending = controller.tryAcquire();
  controller.release();
  assert.equal(await pending, "error");
  await callback({ name: controller.name, mode: "exclusive" } as Lock);
  assert.equal(controller.active, false);
});

test("release during a pending null callback still reports disposed error, not blocked", async (t) => {
  let callback!: LockCallback;
  installNavigator(t, {
    locks: { request: (_name: string, _options: RequestOptions, next: LockCallback) => {
      callback = next;
      return new Promise<void>(() => {});
    } },
  });
  const controller = new SingleTabLock("account-1");
  const pending = controller.tryAcquire();
  controller.release();
  await callback(null);
  assert.equal(await pending, "error");
});

test("missing Web Locks and SSR remain unsupported without touching storage or auth", async (t) => {
  for (const navigatorValue of [undefined, {}, { locks: {} }, { locks: { request: null } }]) {
    installNavigator(t, navigatorValue);
    const controller = new SingleTabLock("account-1");
    assert.equal(await controller.tryAcquire(), "unsupported");
    assert.equal(controller.active, false);
    controller.release();
  }
});

test("denied navigator getter and synchronous request throws fail closed", async (t) => {
  installNavigator(t, { get locks(): never { throw new Error("denied"); } });
  assert.equal(await new SingleTabLock("account-1").tryAcquire(), "error");
  installNavigator(t, { locks: { request() { throw new Error("denied"); } } });
  assert.equal(await new SingleTabLock("account-1").tryAcquire(), "error");
});

test("request rejection before grant is caught and a later recheck can succeed", async (t) => {
  installNavigator(t, { locks: { request: () => Promise.reject(new Error("denied")) } });
  const controller = new SingleTabLock("account-1");
  t.after(() => controller.release());
  assert.equal(await controller.tryAcquire(), "error");
  assert.equal(controller.active, false);
  const locks = new BrowserProfileLocks();
  installNavigator(t, { locks });
  assert.equal(await controller.tryAcquire(), "active");
});

test("unexpected rejection after grant removes ownership and notifies the gate", async (t) => {
  let rejectRequest!: (error: Error) => void;
  let callbackLifetime: Promise<void> | undefined;
  installNavigator(t, {
    locks: { request: (name: string, _options: RequestOptions, callback: LockCallback) => {
      callbackLifetime = callback({ name, mode: "exclusive" } as Lock);
      return new Promise<void>((_resolve, reject) => { rejectRequest = reject; });
    } },
  });
  let losses = 0;
  const controller = new SingleTabLock("account-1", { onOwnershipLost: () => { losses += 1; } });
  assert.equal(await controller.tryAcquire(), "active");
  rejectRequest(new Error("browser revoked lock"));
  await settleBrowserCallbacks();
  await callbackLifetime;
  assert.equal(controller.active, false);
  assert.equal(losses, 1);
  controller.release();
});

test("an exception in the ownership-loss consumer cannot become an unhandled request rejection", async (t) => {
  let rejectRequest!: (error: Error) => void;
  installNavigator(t, {
    locks: { request: (name: string, _options: RequestOptions, callback: LockCallback) => {
      void callback({ name, mode: "exclusive" } as Lock);
      return new Promise<void>((_resolve, reject) => { rejectRequest = reject; });
    } },
  });
  const controller = new SingleTabLock("account-1", { onOwnershipLost: () => { throw new Error("consumer failed"); } });
  assert.equal(await controller.tryAcquire(), "active");
  rejectRequest(new Error("browser revoked lock"));
  await settleBrowserCallbacks();
  assert.equal(controller.active, false);
  controller.release();
});
