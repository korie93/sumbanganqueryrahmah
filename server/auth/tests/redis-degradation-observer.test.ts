import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { observeRedisDegradation } from "./helpers/redis-degradation-observer";

test("records transient degradation even when recovery finishes before the next poll", () => {
  const client = new EventEmitter();
  let degraded = false;
  // As in the live fixture, install the store's listener before observing it.
  client.on("error", () => { degraded = true; });
  const observer = observeRedisDegradation(client, () => degraded);
  try {
    client.emit("error", new Error("fixture socket disconnected"));
    degraded = false;
    assert.equal(degraded, false);
    assert.equal(observer.hasObservedDegradation(), true);
  } finally {
    observer.stop();
  }
});

test("an error without degraded health cannot satisfy the observation", () => {
  const client = new EventEmitter();
  const observer = observeRedisDegradation(client, () => false);
  try {
    client.emit("error", new Error("fixture error without degradation"));
    assert.equal(observer.hasObservedDegradation(), false);
  } finally {
    observer.stop();
  }
});

test("errors before observation cannot provide stale evidence for a later disconnect", () => {
  const client = new EventEmitter();
  let degraded = false;
  client.on("error", () => { degraded = true; });
  client.emit("error", new Error("earlier fixture disconnect"));
  degraded = false;
  const observer = observeRedisDegradation(client, () => degraded);
  try {
    assert.equal(observer.hasObservedDegradation(), false);
    degraded = true;
    assert.equal(observer.hasObservedDegradation(), false, "health alone is not new error evidence");
    client.emit("error", new Error("new fixture disconnect"));
    assert.equal(observer.hasObservedDegradation(), true);
  } finally {
    observer.stop();
  }
});

test("stop removes only the observer and prevents subsequent observations", () => {
  const client = new EventEmitter();
  let degraded = false;
  const storeListener = () => { degraded = true; };
  client.on("error", storeListener);
  const observer = observeRedisDegradation(client, () => degraded);
  assert.equal(client.listenerCount("error"), 2);
  observer.stop();
  observer.stop();
  assert.deepEqual(client.listeners("error"), [storeListener]);
  client.emit("error", new Error("fixture error after observation stopped"));
  assert.equal(degraded, true);
  assert.equal(observer.hasObservedDegradation(), false);
});
