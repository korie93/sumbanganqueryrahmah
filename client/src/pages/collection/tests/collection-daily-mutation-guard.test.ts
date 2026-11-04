import assert from "node:assert/strict";
import test from "node:test";
import { createCollectionDailyMutationGuard } from "../collection-daily-mutation-guard";

test("a target save cannot acquire ownership while calendar changes are unsaved", () => {
  const guard = createCollectionDailyMutationGuard();
  assert.equal(guard.tryStart("target", true), null);
  assert.equal(guard.isBusy(), false);
  assert.equal(typeof guard.tryStart("calendar", true), "function");
});

test("rapid target/calendar saves share one owner until the save and refresh finish", async () => {
  const guard = createCollectionDailyMutationGuard();
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  let requests = 0;
  const save = async (kind: "target" | "calendar") => {
    const release = guard.tryStart(kind, false);
    if (!release) return;
    try {
      requests += 1;
      await pending;
    } finally { release(); }
  };
  const attempts = Array.from({ length: 10 }, (_, index) => save(index % 2 ? "calendar" : "target"));
  assert.equal(requests, 1);
  assert.equal(guard.isBusy(), true);
  finish();
  await Promise.all(attempts);
  assert.equal(guard.isBusy(), false);
  assert.equal(typeof guard.tryStart("calendar", false), "function");
});

test("a failed operation releases ownership and an old release cannot unlock its successor", async () => {
  const guard = createCollectionDailyMutationGuard();
  const release = guard.tryStart("calendar", true)!;
  await assert.rejects(async () => {
    try { throw new Error("Synthetic save failure"); } finally { release(); }
  });
  const nextRelease = guard.tryStart("target", false)!;
  release();
  assert.equal(guard.isBusy(), true);
  assert.equal(guard.tryStart("calendar", true), null);
  nextRelease();
  assert.equal(guard.isBusy(), false);
});
