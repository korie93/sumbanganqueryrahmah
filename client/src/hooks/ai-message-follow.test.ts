import assert from "node:assert/strict";
import test from "node:test";
import { isNearAIMessageBottom, isReadingEarlierAIMessages } from "./ai-message-follow";

test("follow is permitted only near the bottom including short logs and browser overscroll", () => {
  for (const top of [752, 790, 800, 820]) assert.equal(isNearAIMessageBottom({ scrollHeight: 1000, clientHeight: 200, scrollTop: top }), true);
  assert.equal(isNearAIMessageBottom({ scrollHeight: 1000, clientHeight: 200, scrollTop: 751 }), false);
  assert.equal(isNearAIMessageBottom({ scrollHeight: 100, clientHeight: 200, scrollTop: 0 }), true);
});

test("upward reading detaches follow while content growth and downward scroll do not create false intent", () => {
  assert.equal(isReadingEarlierAIMessages({ scrollHeight: 1000, clientHeight: 200, scrollTop: 200 }, 800), true);
  assert.equal(isReadingEarlierAIMessages({ scrollHeight: 1400, clientHeight: 200, scrollTop: 800 }, 800), false);
  assert.equal(isReadingEarlierAIMessages({ scrollHeight: 1000, clientHeight: 200, scrollTop: 600 }, 400), false);
  assert.equal(isReadingEarlierAIMessages({ scrollHeight: 1000, clientHeight: 200, scrollTop: 790 }, 800), false);
});
