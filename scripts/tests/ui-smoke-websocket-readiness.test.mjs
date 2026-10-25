import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { attachSmokeWebSocketReadiness } from "../lib/ui-smoke-websocket-readiness.mjs";

class FakeCdp extends EventEmitter {
  commands = [];
  detachCalls = 0;
  async send(command) { this.commands.push(command); return {}; }
  async detach() { this.detachCalls += 1; }
}

async function harness(context, options = {}) {
  const session = new FakeCdp();
  const page = {};
  const observer = await attachSmokeWebSocketReadiness({
    context: { async newCDPSession(target) { assert.equal(target, page); return session; } },
    page, baseUrl: "http://127.0.0.1:5000", timeoutMs: 1_000, ...options,
  });
  context.after(() => observer.dispose());
  return {
    session, ...observer,
    created(id, url = "ws://127.0.0.1:5000/ws") { session.emit("Network.webSocketCreated", { requestId: id, url }); },
    handshake(id, status = 101) { session.emit("Network.webSocketHandshakeResponseReceived", { requestId: id, response: { status } }); },
    navigate(frame = { id: "main", url: "http://127.0.0.1:5000/collection/billing-principal" }) { session.emit("Page.frameNavigated", { frame }); },
  };
}

test("owned socket creation remains pending until its matching native 101 handshake", async (context) => {
  const state = await harness(context);
  let navigations = 0;
  const waiting = state.waitForOpen().then(() => { navigations += 1; });
  state.created("owned");
  await Promise.resolve();
  assert.equal(navigations, 0, "Document load/socket construction is not handshake readiness");
  state.handshake("other-request");
  await Promise.resolve();
  assert.equal(navigations, 0);
  state.handshake("owned");
  await waiting;
  assert.equal(navigations, 1);
  await state.waitForOpen();
  assert.deepEqual(state.session.commands, ["Page.enable", "Network.enable"]);
});

test("only the exact same-origin app socket can satisfy readiness", async (context) => {
  const state = await harness(context);
  let opened = false;
  const waiting = state.waitForOpen().then(() => { opened = true; });
  for (const url of [
    "ws://other.test:5000/ws", "ws://127.0.0.1:5001/ws", "wss://127.0.0.1:5000/ws",
    "ws://127.0.0.1:5000/api/ws", "ws://127.0.0.1:5000/ws?other=1", "not-a-url",
  ]) {
    state.created("unowned", url);
    state.handshake("unowned");
  }
  await Promise.resolve();
  assert.equal(opened, false);
  state.created("owned");
  state.handshake("owned");
  await waiting;
});

test("a newer owned socket supersedes an older socket in the same document", async (context) => {
  const state = await harness(context);
  state.created("earlier");
  state.created("latest");
  let opened = false;
  const waiting = state.waitForOpen().then(() => { opened = true; });
  state.handshake("earlier");
  state.session.emit("Network.webSocketFrameError", { requestId: "earlier", errorMessage: "ignored old failure" });
  state.session.emit("Network.webSocketClosed", { requestId: "earlier" });
  await Promise.resolve();
  assert.equal(opened, false);
  state.handshake("latest");
  await waiting;
});

test("main document navigation invalidates old handshakes and pending waiters", async (context) => {
  const state = await harness(context);
  state.created("old-document");
  const oldWaiting = assert.rejects(state.waitForOpen(), /document changed before socket readiness/);
  state.navigate();
  await oldWaiting;
  let opened = false;
  const newWaiting = state.waitForOpen().then(() => { opened = true; });
  state.handshake("old-document");
  state.session.emit("Network.webSocketClosed", { requestId: "old-document" });
  await Promise.resolve();
  assert.equal(opened, false);
  state.created("new-document");
  state.handshake("new-document");
  await newWaiting;
  state.navigate({ id: "new-main-process", url: "http://127.0.0.1:5000/collection/records" });
  const latestWaiting = state.waitForOpen();
  state.handshake("new-document");
  state.created("latest-document");
  state.handshake("latest-document");
  await latestWaiting;
});

test("subframe commits and same-document SPA navigation keep the active handshake", async (context) => {
  const state = await harness(context);
  state.created("app");
  const waiting = state.waitForOpen();
  state.navigate({ id: "receipt-frame", parentId: "main", url: "http://127.0.0.1:5000/receipt" });
  state.session.emit("Page.navigatedWithinDocument", { frameId: "main", url: "http://127.0.0.1:5000/collection/daily" });
  state.handshake("app");
  await waiting;
  state.navigate({ id: "receipt-frame", parentId: "main" });
  state.session.emit("Page.navigatedWithinDocument", { frameId: "main", url: "http://127.0.0.1:5000/collection/records" });
  await state.waitForOpen();
});

for (const [label, event, fields, expected] of [
  ["non-101 handshake", "Network.webSocketHandshakeResponseReceived", { response: { status: 403, headers: { private: "not-retained" } } }, "handshake did not return status 101"],
  ["native frame error", "Network.webSocketFrameError", { errorMessage: "private upstream details must not be recorded" }, "transport reported a socket error"],
]) {
  test(`${label} rejects readiness without recording remote payloads`, async (context) => {
    const state = await harness(context);
    state.created("owned");
    const rejected = assert.rejects(state.waitForOpen(), (error) => error.message === `SQR smoke /ws ${expected}.`);
    state.session.emit(event, { requestId: "owned", ...fields });
    await rejected;
    await assert.rejects(state.waitForOpen(), (error) => error.message === `SQR smoke /ws ${expected}.`);
    state.handshake("owned");
    await assert.rejects(state.waitForOpen());
    state.created("reconnected");
    state.handshake("reconnected");
    await assert.rejects(state.waitForOpen(), (error) => error.message === `SQR smoke /ws ${expected}.`,
      "A new socket cannot hide a hard failure in the same document");
    state.session.emit("Page.navigatedWithinDocument", { frameId: "main", url: "http://127.0.0.1:5000/collection/daily" });
    state.navigate({ id: "receipt-frame", parentId: "main" });
    await assert.rejects(state.waitForOpen(), (error) => error.message === `SQR smoke /ws ${expected}.`);
    state.navigate();
    state.handshake("reconnected");
    state.created("new-document");
    state.handshake("new-document");
    await state.waitForOpen();
  });
}

test("a clean close before 101 waits for a replacement without accepting the closed socket's late handshake", async (context) => {
  const state = await harness(context);
  state.created("initial");
  let opened = false;
  const waiting = state.waitForOpen().then(() => { opened = true; });
  state.session.emit("Network.webSocketClosed", { requestId: "initial" });
  state.handshake("initial");
  await Promise.resolve();
  assert.equal(opened, false, "A closed socket cannot become ready again through a late 101");
  state.created("replacement");
  state.session.emit("Network.webSocketFrameError", { requestId: "initial", errorMessage: "stale socket" });
  state.session.emit("Network.webSocketClosed", { requestId: "initial" });
  state.handshake("replacement");
  await waiting;
});

test("an opened socket that closes waits for a live replacement before allowing navigation", async (context) => {
  const state = await harness(context);
  state.created("owned");
  state.handshake("owned");
  await state.waitForOpen();
  state.session.emit("Network.webSocketClosed", { requestId: "owned" });
  let navigations = 0;
  const waiting = state.waitForOpen().then(() => { navigations += 1; });
  state.handshake("owned");
  await Promise.resolve();
  assert.equal(navigations, 0, "Previously opened but now closed is not navigation readiness");
  state.created("replacement");
  state.handshake("replacement");
  await waiting;
  assert.equal(navigations, 1);
});

test("a permanent clean closure fails at the bounded readiness deadline", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const state = await harness(context, { timeoutMs: 25 });
  state.created("closed");
  state.session.emit("Network.webSocketClosed", { requestId: "closed" });
  const rejected = assert.rejects(state.waitForOpen(), /handshake readiness timed out/);
  context.mock.timers.tick(25);
  await rejected;
});

test("repeated clean closures and replacements cannot restart an existing waiter's deadline", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const state = await harness(context, { timeoutMs: 30 });
  let timedOut = false;
  const rejected = assert.rejects(state.waitForOpen(), /handshake readiness timed out/).then(() => { timedOut = true; });
  for (const id of ["initial", "retry-one", "retry-two"]) {
    state.created(id);
    context.mock.timers.tick(9);
    state.session.emit("Network.webSocketClosed", { requestId: id });
    state.handshake(id);
  }
  state.created("retry-three");
  await Promise.resolve();
  assert.equal(timedOut, false);
  context.mock.timers.tick(3);
  await rejected;
  assert.equal(timedOut, true, "The first wait ends at its original 30ms deadline");
  state.handshake("retry-three");
  await state.waitForOpen();
});

test("handshake waits have an explicit bounded timeout", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const state = await harness(context, { timeoutMs: 25 });
  const rejected = assert.rejects(state.waitForOpen(), /handshake readiness timed out/);
  context.mock.timers.tick(25);
  await rejected;
  state.created("late-but-current");
  state.handshake("late-but-current");
  await state.waitForOpen();
});

test("dispose rejects waiters, removes observers and detaches exactly once", async (context) => {
  const state = await harness(context);
  state.created("pending");
  const rejected = assert.rejects(state.waitForOpen(), /readiness observer was disposed/);
  await state.dispose();
  await rejected;
  assert.equal(state.session.eventNames().length, 0);
  assert.equal(state.session.detachCalls, 1);
  state.handshake("pending");
  state.created("after-dispose");
  state.handshake("after-dispose");
  await assert.rejects(state.waitForOpen(), /readiness observer was disposed/);
  await state.dispose();
  assert.equal(state.session.detachCalls, 1);
});

test("failure to enable passive observation cleans up the CDP session", async () => {
  const session = new FakeCdp();
  session.send = async () => { throw new Error("fixture cannot enable observation"); };
  await assert.rejects(attachSmokeWebSocketReadiness({
    context: { async newCDPSession() { return session; } }, page: {}, baseUrl: "https://example.test",
  }), /fixture cannot enable observation/);
  assert.equal(session.eventNames().length, 0);
  assert.equal(session.detachCalls, 1);
});

test("HTTPS origins require the corresponding exact WSS endpoint", async (context) => {
  const state = await harness(context, { baseUrl: "https://example.test/path" });
  const waiting = state.waitForOpen();
  state.created("secure", "wss://example.test/ws");
  state.handshake("secure");
  await waiting;
});
