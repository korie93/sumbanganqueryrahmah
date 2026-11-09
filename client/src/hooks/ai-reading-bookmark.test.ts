import assert from "node:assert/strict";
import test from "node:test";
import {
  captureAIReadingBookmark, createAIReadingBookmarkStore, restoreAIReadingBookmark, type AIReadingBookmark,
} from "./ai-reading-bookmark";

const reading: AIReadingBookmark = { followLatest: false, scrollTop: 240, anchorId: "message-2", anchorOffset: -20 };

function createLog(articles: readonly { id: string; top: number; height: number }[], options: {
  scrollTop?: number; height?: number; scrollHeight?: number; connected?: boolean;
} = {}) {
  const log = {
    isConnected: options.connected ?? true,
    scrollTop: options.scrollTop ?? 0,
    clientHeight: options.height ?? 200,
    clientTop: 1,
    scrollHeight: options.scrollHeight ?? 1200,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelectorAll: (selector: string) => {
      assert.equal(selector, "[data-ai-message-id]");
      return articles.map((article) => ({
        getAttribute: (name: string) => {
          assert.equal(name, "data-ai-message-id");
          return article.id;
        },
        getBoundingClientRect: () => ({
          top: 101 + article.top - log.scrollTop,
          bottom: 101 + article.top + article.height - log.scrollTop,
        }),
      }));
    },
  };
  return log as unknown as HTMLElement;
}

test("bookmark stores are independent single slots and never retain the caller's mutable object", () => {
  const ownerA = createAIReadingBookmarkStore();
  const ownerB = createAIReadingBookmarkStore();
  const snapshot = { ...reading };
  assert.equal(ownerA.write(snapshot, ownerA.getGeneration()), true);
  snapshot.scrollTop = 999;
  const saved = ownerA.read()!;
  assert.deepEqual(saved, reading);
  saved.anchorId = "modified";
  assert.deepEqual(ownerA.read(), reading);
  assert.equal(ownerB.read(), null);
  ownerA.write({ ...reading, scrollTop: 480 }, ownerA.getGeneration());
  assert.equal(ownerA.read()!.scrollTop, 480);
});

test("reset clears the bookmark and rejects a late unmount write from the previous conversation", () => {
  const store = createAIReadingBookmarkStore();
  const generation = store.getGeneration();
  store.write(reading, generation);
  store.clear();
  assert.equal(store.read(), null);
  assert.equal(store.write(reading, generation), false);
  assert.equal(store.read(), null);
  assert.equal(store.write(reading, store.getGeneration()), true);
});

test("bookmark data rejects invalid offsets and bounds the only retained string", () => {
  const store = createAIReadingBookmarkStore();
  for (const invalid of [
    { ...reading, scrollTop: Number.NaN }, { ...reading, scrollTop: Number.POSITIVE_INFINITY },
    { ...reading, scrollTop: -1 }, { ...reading, anchorOffset: Number.NEGATIVE_INFINITY },
  ]) assert.equal(store.write(invalid, store.getGeneration()), false);
  assert.equal(store.read(), null);
  store.write({ ...reading, anchorId: "x".repeat(257) }, store.getGeneration());
  assert.deepEqual(store.read(), { ...reading, anchorId: null, anchorOffset: 0 });
});

test("capture chooses the first intersecting finalized message and preserves its clipped offset", () => {
  const log = createLog([
    { id: "old", top: 0, height: 100 }, { id: "message-2", top: 220, height: 180 },
    { id: "message-3", top: 400, height: 200 },
  ], { scrollTop: 240 });
  assert.deepEqual(captureAIReadingBookmark(log, false), reading);
  assert.deepEqual(captureAIReadingBookmark(log, true), { followLatest: true, scrollTop: 240, anchorId: null, anchorOffset: 0 });
});

test("restore follows the same message through wrapping changes and newly added messages", () => {
  const log = createLog([
    { id: "old", top: 0, height: 300 }, { id: "message-2", top: 420, height: 320 },
    { id: "message-3", top: 740, height: 300 },
  ]);
  assert.equal(restoreAIReadingBookmark(log, reading), 440);
  assert.equal(captureAIReadingBookmark(log, false)!.anchorOffset, -20);
  assert.equal(restoreAIReadingBookmark(log, { ...reading, followLatest: true }), 1000);
});

test("evicted message anchors return to the first retained history instead of a stale unrelated offset", () => {
  const log = createLog([{ id: "retained-message", top: 0, height: 400 }], { scrollTop: 300 });
  assert.equal(restoreAIReadingBookmark(log, reading), 0);
  assert.equal(restoreAIReadingBookmark(log, { ...reading, anchorId: null }), 240);
});

test("restoration clamps short history and ignores hidden or detached logs", () => {
  const short = createLog([], { scrollHeight: 100 });
  assert.equal(restoreAIReadingBookmark(short, { ...reading, anchorId: null }), 0);
  for (const log of [createLog([], { height: 0, scrollTop: 75 }), createLog([], { connected: false, scrollTop: 75 })]) {
    assert.equal(captureAIReadingBookmark(log, false), null);
    assert.equal(restoreAIReadingBookmark(log, reading), null);
    assert.equal(log.scrollTop, 75);
  }
});

test("message IDs are compared as data without interpolating them into a CSS selector", () => {
  const anchorId = 'message-"] 🧾 [data-private="';
  const log = createLog([{ id: anchorId, top: 220, height: 180 }]);
  assert.equal(restoreAIReadingBookmark(log, { ...reading, anchorId }), 240);
});

test("capture and restore inspect at most the existing thirty-message history cap", () => {
  const articles = Array.from({ length: 31 }, (_, index) => ({ id: `message-${index}`, top: index * 100, height: 100 }));
  const log = createLog(articles, { scrollTop: 3050, scrollHeight: 4000 });
  assert.equal(captureAIReadingBookmark(log, false)!.anchorId, null);
  assert.equal(restoreAIReadingBookmark(log, { ...reading, anchorId: "message-30" }), 0);
});
