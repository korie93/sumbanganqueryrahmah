import assert from "node:assert/strict";
import test from "node:test";
import { beginAuthNavigationIntent, invalidateAuthNavigationIntents } from "./auth-navigation-preload";
import { createViewTransitionController } from "./view-transition";

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function nativeFixture() {
  const ready = deferred();
  const updated = deferred();
  const finished = deferred();
  let callback: (() => void) | undefined;
  let skips = 0;
  return {
    ready, updated, finished,
    get skips() { return skips; },
    apply() { assert.ok(callback); callback(); },
    start(update: () => void) {
      callback = update;
      return { ready: ready.promise, updateCallbackDone: updated.promise, finished: finished.promise, skipTransition() { skips++; } };
    },
  };
}

test("unsupported and server environments apply navigation once without native markers", async () => {
  for (const document of [undefined, { documentElement: { dataset: {} as Record<string, string | undefined> } }]) {
    let updates = 0;
    const controller = createViewTransitionController({ getDocument: () => document, prefersReducedMotion: () => false,
      flush: () => { assert.fail("Unsupported transitions must not use native flushing"); } });
    await controller.run(() => { updates++; });
    assert.equal(updates, 1);
    assert.equal(controller.getActiveKind(), null);
    assert.equal(document?.documentElement.dataset.vt, undefined);
  }
});

test("reduced motion applies immediately and never starts a browser transition", async () => {
  let updates = 0;
  const document = { documentElement: { dataset: {} as Record<string, string | undefined> },
    startViewTransition() { assert.fail("Reduced motion must bypass the browser transition"); } };
  const controller = createViewTransitionController({ getDocument: () => document, prefersReducedMotion: () => true, flush: update => update() });
  const done = controller.run(() => { updates++; }, "page");
  assert.equal(updates, 1);
  assert.equal(document.documentElement.dataset.vt, undefined);
  await done;
});

test("native updates expose their kind during one synchronous commit and clean up on completion", async () => {
  const native = nativeFixture();
  const document = { documentElement: { dataset: {} as Record<string, string | undefined> }, startViewTransition: native.start };
  let updates = 0;
  let flushes = 0;
  const controller = createViewTransitionController({ getDocument: () => document, prefersReducedMotion: () => false,
    flush: update => { flushes++; assert.equal(controller.getActiveKind(), "auth"); update(); } });
  const done = controller.run(() => { updates++; });
  assert.equal(document.documentElement.dataset.vt, "auth");
  native.apply();
  native.apply();
  assert.equal(updates, 1);
  assert.equal(flushes, 1);
  native.ready.resolve();
  native.finished.resolve();
  await done;
  assert.equal(controller.getActiveKind(), null);
  assert.equal(document.documentElement.dataset.vt, undefined);
});

test("a rapid newer transition cancels a delayed old update and owns cleanup", async () => {
  const first = nativeFixture();
  const second = nativeFixture();
  let starts = 0;
  const document = { documentElement: { dataset: {} as Record<string, string | undefined> },
    startViewTransition: (update: () => void) => (++starts === 1 ? first : second).start(update) };
  const controller = createViewTransitionController({ getDocument: () => document, prefersReducedMotion: () => false, flush: update => update() });
  let firstUpdates = 0;
  let secondUpdates = 0;
  const firstDone = controller.run(() => { firstUpdates++; });
  const secondDone = controller.run(() => { secondUpdates++; }, "page");
  assert.equal(first.skips, 1);
  first.apply();
  second.apply();
  assert.equal(firstUpdates, 0);
  assert.equal(secondUpdates, 1);
  first.ready.reject(new Error("superseded snapshot"));
  first.finished.reject(new Error("superseded animation"));
  await firstDone;
  assert.equal(controller.getActiveKind(), "page");
  assert.equal(document.documentElement.dataset.vt, "page");
  second.ready.resolve();
  second.finished.resolve();
  await secondDone;
  assert.equal(document.documentElement.dataset.vt, undefined);
});

test("changing to reduced motion cancels a pending native callback before the instant update", async () => {
  const native = nativeFixture();
  let reduce = false;
  let updates = 0;
  const document = { documentElement: { dataset: {} as Record<string, string | undefined> }, startViewTransition: native.start };
  const controller = createViewTransitionController({ getDocument: () => document, prefersReducedMotion: () => reduce, flush: update => update() });
  const previous = controller.run(() => { assert.fail("Superseded navigation must not run"); });
  reduce = true;
  await controller.run(() => { updates++; });
  native.apply();
  native.ready.reject(new Error("skipped"));
  native.finished.resolve();
  await previous;
  assert.equal(native.skips, 1);
  assert.equal(updates, 1);
  assert.equal(document.documentElement.dataset.vt, undefined);
});

test("native start failures fall back once whether thrown before or after the callback", async () => {
  for (const afterCallback of [false, true]) {
    let updates = 0;
    const document = { documentElement: { dataset: {} as Record<string, string | undefined> }, startViewTransition(update: () => void) {
      if (afterCallback) update();
      throw new Error("native transition unavailable");
    } };
    const controller = createViewTransitionController({ getDocument: () => document, prefersReducedMotion: () => false, flush: update => update() });
    await controller.run(() => { updates++; });
    assert.equal(updates, 1);
    assert.equal(controller.getActiveKind(), null);
    assert.equal(document.documentElement.dataset.vt, undefined);
  }
});

test("native lifecycle rejections are observed without retrying navigation", async () => {
  const native = nativeFixture();
  let updates = 0;
  const document = { documentElement: { dataset: {} as Record<string, string | undefined> }, startViewTransition: native.start };
  const controller = createViewTransitionController({ getDocument: () => document, prefersReducedMotion: () => false, flush: update => update() });
  const done = controller.run(() => { updates++; });
  native.apply();
  native.ready.reject(new Error("snapshot rejected"));
  native.updated.reject(new Error("update acknowledgement rejected"));
  native.finished.reject(new Error("animation rejected"));
  await done;
  assert.equal(updates, 1);
  assert.equal(document.documentElement.dataset.vt, undefined);
});

test("callback exceptions are not mistaken for a reason to retry navigation", () => {
  const failure = new Error("callback failed");
  let updates = 0;
  const document = { documentElement: { dataset: {} as Record<string, string | undefined> },
    startViewTransition(update: () => void): never { update(); throw new Error("unreachable"); } };
  const controller = createViewTransitionController({ getDocument: () => document, prefersReducedMotion: () => false, flush: update => update() });
  assert.throws(() => controller.run(() => { updates++; throw failure; }), failure);
  assert.equal(updates, 1);
  assert.equal(controller.getActiveKind(), null);
  assert.equal(document.documentElement.dataset.vt, undefined);
});

test("completion preserves a marker now owned by an outside transition", async () => {
  const native = nativeFixture();
  const document = { documentElement: { dataset: {} as Record<string, string | undefined> }, startViewTransition: native.start };
  const controller = createViewTransitionController({ getDocument: () => document, prefersReducedMotion: () => false, flush: update => update() });
  const done = controller.run(() => {});
  native.apply();
  document.documentElement.dataset.vt = "page";
  native.ready.resolve();
  native.finished.resolve();
  await done;
  assert.equal(controller.getActiveKind(), null);
  assert.equal(document.documentElement.dataset.vt, "page");
});

test("latest navigation intent wins while stale cleanup leaves the newer intent valid", () => {
  const previous = beginAuthNavigationIntent();
  const current = beginAuthNavigationIntent();
  assert.equal(previous.isCurrent(), false);
  previous.cancel();
  assert.equal(current.isCurrent(), true);
  current.cancel();
  assert.equal(current.isCurrent(), false);
  const external = beginAuthNavigationIntent();
  invalidateAuthNavigationIntents();
  assert.equal(external.isCurrent(), false);
});

test("external cancellation clears motion before history rendering and preserves newer ownership", async () => {
  for (const alreadyApplied of [false, true]) {
    const previous = nativeFixture();
    const next = nativeFixture();
    let starts = 0;
    let previousUpdates = 0;
    let nextUpdates = 0;
    const document = {
      documentElement: { dataset: {} as Record<string, string | undefined> },
      startViewTransition: (update: () => void) => (++starts === 1 ? previous : next).start(update),
    };
    const controller = createViewTransitionController({
      getDocument: () => document, prefersReducedMotion: () => false, flush: update => update(),
    });
    const previousDone = controller.run(() => { previousUpdates++; });
    if (alreadyApplied) previous.apply();
    controller.cancel();
    assert.equal(previous.skips, 1);
    assert.equal(controller.getActiveKind(), null);
    assert.equal(document.documentElement.dataset.vt, undefined);
    previous.apply();
    assert.equal(previousUpdates, alreadyApplied ? 1 : 0);
    const nextDone = controller.run(() => { nextUpdates++; }, "page");
    next.apply();
    previous.ready.reject(new Error("externally cancelled"));
    previous.updated.reject(new Error("externally cancelled"));
    previous.finished.reject(new Error("externally cancelled"));
    await previousDone;
    assert.equal(previousUpdates, alreadyApplied ? 1 : 0);
    assert.equal(nextUpdates, 1);
    assert.equal(controller.getActiveKind(), "page");
    assert.equal(document.documentElement.dataset.vt, "page");
    next.ready.resolve();
    next.updated.resolve();
    next.finished.resolve();
    await nextDone;
    assert.equal(controller.getActiveKind(), null);
    assert.equal(document.documentElement.dataset.vt, undefined);
  }
});
