import assert from "node:assert/strict";
import test from "node:test";
import { createViewerExportLifecycle } from "@/pages/viewer/viewer-export-lifecycle";

const kinds = ["csv", "excel", "pdf"] as const;

for (const kind of kinds) {
  test(`a ${kind} owner blocks every overlapping export before a rerender`, () => {
    const lifecycle = createViewerExportLifecycle();
    const owner = lifecycle.start(kind);
    assert.ok(owner);
    assert.equal(owner.kind, kind);
    assert.equal(lifecycle.isBusy(), true);
    assert.equal(lifecycle.isCurrent(owner), true);
    assert.equal(owner.controller.signal.aborted, false);

    for (const overlapKind of kinds) {
      assert.equal(lifecycle.start(overlapKind), null);
    }

    assert.equal(lifecycle.isCurrent(owner), true);
    assert.equal(lifecycle.finish(owner), true);
    assert.equal(lifecycle.isBusy(), false);
    assert.equal(lifecycle.isCurrent(owner), false);
    assert.equal(lifecycle.finish(owner), false);
    assert.ok(lifecycle.start(kind));
  });
}

for (const replacementKind of kinds) {
  test(`a cancelled CSV finalizer cannot release its ${replacementKind} replacement`, () => {
    const lifecycle = createViewerExportLifecycle();
    const cancelled = lifecycle.start("csv");
    assert.ok(cancelled);

    lifecycle.cancel();
    assert.equal(cancelled.controller.signal.aborted, true);
    assert.equal(lifecycle.isCurrent(cancelled), false);
    assert.equal(lifecycle.isBusy(), false);

    const replacement = lifecycle.start(replacementKind);
    assert.ok(replacement);
    assert.notEqual(replacement, cancelled);
    assert.equal(lifecycle.finish(cancelled), false);
    assert.equal(lifecycle.isCurrent(replacement), true);
    assert.equal(lifecycle.isBusy(), true);
    assert.equal(replacement.controller.signal.aborted, false);
    assert.equal(lifecycle.start("csv"), null);

    assert.equal(lifecycle.finish(replacement), true);
    assert.equal(lifecycle.isBusy(), false);
    assert.ok(lifecycle.start("csv"));
  });
}

test("cancellation detaches its owner before an abort listener starts a replacement", () => {
  const lifecycle = createViewerExportLifecycle();
  const owner = lifecycle.start("csv");
  assert.ok(owner);
  let replacement: ReturnType<typeof lifecycle.start> = null;
  owner.controller.signal.addEventListener("abort", () => {
    replacement = lifecycle.start("pdf");
  });

  lifecycle.cancel();

  assert.ok(replacement);
  assert.equal(lifecycle.isCurrent(replacement), true);
  assert.equal(lifecycle.isBusy(), true);
  assert.equal(lifecycle.finish(owner), false);
  assert.equal(lifecycle.finish(replacement), true);
});

test("an aborted owner cannot continue, and cancellation permits retry", () => {
  const lifecycle = createViewerExportLifecycle();
  const owner = lifecycle.start("csv");
  assert.ok(owner);

  owner.controller.abort();

  assert.equal(lifecycle.isCurrent(owner), false);
  lifecycle.cancel();
  lifecycle.cancel();
  assert.equal(lifecycle.isBusy(), false);
  const retry = lifecycle.start("csv");
  assert.ok(retry);
  assert.equal(lifecycle.isCurrent(retry), true);
  assert.equal(retry.controller.signal.aborted, false);
});
