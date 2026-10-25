// Passive Chromium observation only. Do not replace the app's socket, suppress
// its console output, or retain handshake headers, frames, or error payloads.
export async function attachSmokeWebSocketReadiness({ context, page, baseUrl, timeoutMs = 10_000 }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("A positive socket readiness timeout is required.");
  const origin = new URL(baseUrl);
  if (!["http:", "https:"].includes(origin.protocol)) throw new TypeError("An HTTP smoke origin is required.");
  const socketUrl = `${origin.protocol === "https:" ? "wss:" : "ws:"}//${origin.host}/ws`;
  const session = await context.newCDPSession(page);
  const waiters = new Set();
  let generation = 0;
  let current = null;
  let hardFailure = null;
  let disposed = false;
  const failure = (reason) => new Error(`SQR smoke /ws ${reason}.`);
  const settle = (error) => {
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      if (error) waiter.reject(error);
      else waiter.resolve();
    }
    waiters.clear();
  };
  const matchesCurrent = (event) => !disposed && current?.generation === generation && current.id === event.requestId;
  const failCurrent = (reason) => {
    current.state = "failed";
    hardFailure ??= failure(reason);
    settle(hardFailure);
  };
  const handlers = {
    "Network.webSocketCreated": (event) => {
      if (!disposed && event.url === socketUrl) {
        current = { id: event.requestId, generation, state: "connecting" };
      }
    },
    "Network.webSocketHandshakeResponseReceived": (event) => {
      if (!matchesCurrent(event) || hardFailure) return;
      if (event.response?.status !== 101) return failCurrent("handshake did not return status 101");
      if (current.state !== "connecting") return;
      current.state = "open";
      settle();
    },
    "Network.webSocketFrameError": (event) => {
      if (matchesCurrent(event)) failCurrent("transport reported a socket error");
    },
    "Network.webSocketClosed": (event) => {
      if (!matchesCurrent(event) || hardFailure) return;
      // The app owns reconnect/replacement. A clean close invalidates readiness
      // but does not reset any waiter's original deadline or hide hard errors.
      current.state = "closed";
    },
    "Page.frameNavigated": ({ frame }) => {
      if (disposed || !frame || frame.parentId) return;
      // Cross-document main-frame commits invalidate old socket IDs. Subframes
      // and Page.navigatedWithinDocument (SPA/history changes) do not reset it.
      generation += 1;
      current = null;
      hardFailure = null;
      settle(failure("document changed before socket readiness"));
    },
  };
  for (const [name, handler] of Object.entries(handlers)) session.on(name, handler);
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    current = null;
    for (const [name, handler] of Object.entries(handlers)) session.off(name, handler);
    settle(failure("readiness observer was disposed"));
    await session.detach().catch(() => {});
  };
  try {
    await session.send("Page.enable");
    await session.send("Network.enable");
  } catch (error) {
    await dispose();
    throw error;
  }
  return {
    waitForOpen() {
      if (disposed) return Promise.reject(failure("readiness observer was disposed"));
      if (hardFailure) return Promise.reject(hardFailure);
      if (current?.state === "open") return Promise.resolve();
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(failure("handshake readiness timed out"));
        }, timeoutMs);
        waiters.add(waiter);
      });
    },
    dispose,
  };
}
