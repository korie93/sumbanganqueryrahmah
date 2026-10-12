import assert from "node:assert/strict";
import test from "node:test";
import {
  FAVICON_CONFIRM_MS,
  FAVICON_CONNECTIVITY_URL,
  FAVICON_POLL_MS,
  FAVICON_TIMEOUT_MS,
  startFaviconStatus,
  type FaviconEnvironment,
} from "./favicon-status";

const offlinePng = "data:image/png;base64,c3ludGhldGljLW9mZmxpbmU=";
const onlinePng = "/brand/favicon-online-v1-32.png";
const onlineIco = "/brand/favicon-online-v1.ico";

class ListenerTarget extends EventTarget {
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    super.addEventListener(type, listener, options);
    if (!listener) return;
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    super.removeEventListener(type, listener, options);
    if (listener) this.listeners.get(type)?.delete(listener);
  }

  get listenerCount() {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }
}

class Link {
  private readonly attributes: Map<string, string>;

  constructor(attributes: Record<string, string>) {
    this.attributes = new Map(Object.entries(attributes));
  }

  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  snapshot() { return Object.fromEntries(this.attributes); }
}

type PendingFetch = {
  url: RequestInfo | URL;
  init: RequestInit;
  settled: boolean;
  resolve: (response: Response) => void;
  reject: (reason: Error) => void;
};

async function flush() {
  // Settle fetch, Promise.race, and the check's finally without real timers.
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

function fixture(initiallyOnline = true, initiallyHidden = false) {
  const icon = new Link({ rel: "icon", href: onlinePng, type: "image/png", sizes: "32x32" });
  const shortcut = new Link({ rel: "shortcut icon", href: onlineIco, type: "image/x-icon" });
  const apple = new Link({ rel: "apple-touch-icon", href: "/brand/apple-touch-icon-180x180.png", sizes: "180x180" });
  const originals = [icon.snapshot(), shortcut.snapshot(), apple.snapshot()];
  const documentTarget = Object.assign(new ListenerTarget(), {
    hidden: initiallyHidden,
    head: {
      querySelectorAll(selector: string) {
        assert.equal(selector, 'link[rel~="icon"]');
        return [icon, shortcut];
      },
    },
  });
  const timers = new Map<number, { at: number; callback: () => void }>();
  let now = 0;
  let nextTimer = 0;
  const windowTarget = Object.assign(new ListenerTarget(), {
    setTimeout(callback: () => void, delay: number) {
      const id = ++nextTimer;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id: number) { timers.delete(id); },
  });
  const navigatorTarget = { onLine: initiallyOnline };
  const requests: PendingFetch[] = [];
  const environment = {
    document: documentTarget,
    window: windowTarget,
    navigator: navigatorTarget,
    fetch: (url: RequestInfo | URL, init: RequestInit = {}) => new Promise<Response>((resolve, reject) => {
      const pending: PendingFetch = {
        url, init, settled: false,
        resolve(response) { pending.settled = true; resolve(response); },
        reject(reason) { pending.settled = true; reject(reason); },
      };
      requests.push(pending);
    }),
  } as unknown as FaviconEnvironment;
  const event = (name: string) => windowTarget.dispatchEvent(new Event(name));
  const visibility = (hidden: boolean) => {
    documentTarget.hidden = hidden;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
  };
  async function advance(ms: number) {
    const until = now + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((left, right) => left[1].at - right[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      timers.delete(id);
      timer.callback();
      await flush();
    }
    now = until;
    await flush();
  }
  const activeRequests = () => requests.filter(request => !request.settled && !request.init.signal?.aborted).length;
  const state = () => [icon, shortcut].map(link => link.getAttribute("data-sqr-connectivity"));
  const stop = startFaviconStatus(offlinePng, environment);
  return { environment, documentTarget, windowTarget, navigatorTarget, icon, shortcut, apple, originals,
    requests, timers, event, visibility, advance, activeRequests, state, stop };
}

function connected() {
  return new Response(null, { status: 204, headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" } });
}

test("favicon marks online only after the explicit uncached endpoint succeeds and polls every 20 seconds", async (t) => {
  const f = fixture();
  t.after(f.stop);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.state(), ["unknown", "unknown"]);
  assert.equal(f.requests[0].url, FAVICON_CONNECTIVITY_URL);
  const options = f.requests[0].init;
  assert.equal(options.method, "GET");
  assert.equal(options.credentials, "omit");
  assert.equal(options.cache, "no-store");
  assert.equal(options.redirect, "error");
  assert.equal(options.body, undefined);
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(f.timers.size, 1);
  await f.advance(FAVICON_TIMEOUT_MS - 1);
  assert.equal(f.requests.length, 1, "An active probe never starts a second probe.");
  f.requests[0].resolve(connected());
  await flush();
  assert.deepEqual(f.state(), ["online", "online"]);
  assert.equal(f.icon.getAttribute("href"), onlinePng);
  assert.equal(f.shortcut.getAttribute("href"), onlineIco);
  assert.deepEqual(f.apple.snapshot(), f.originals[2]);
  assert.equal(f.timers.size, 1, "The completed request's timeout is removed.");
  await f.advance(FAVICON_POLL_MS - 1);
  assert.equal(f.requests.length, 1);
  await f.advance(1);
  assert.equal(f.requests.length, 2);
  assert.equal(f.activeRequests(), 1);
  await f.advance(FAVICON_TIMEOUT_MS - 1);
  assert.equal(f.requests.length, 2, "Polling cannot overlap the pending request.");
});

const invalidResponses: Array<[string, () => Response]> = [
  ["HTTP 200 HTML from a captive portal or SPA fallback", () => new Response("<html>Login required</html>", {
    status: 200, headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store", "Content-Type": "text/html" },
  })],
  ["an incorrect connectivity marker", () => new Response(null, { status: 204,
    headers: { "X-SQR-Connectivity": "other-service", "Cache-Control": "no-store" } })],
  ["a missing connectivity marker", () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })],
  ["a missing no-store directive", () => new Response(null, { status: 204, headers: { "X-SQR-Connectivity": "ok" } })],
  ["a cacheable lookalike directive", () => new Response(null, { status: 204,
    headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "not-no-store, public" } })],
  ["an HTTP 503 backend error", () => new Response(null, { status: 503,
    headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" } })],
  ["a redirected response", () => Object.defineProperty(connected(), "redirected", { value: true })],
];

for (const [name, response] of invalidResponses) {
  test(`favicon confirms ${name} before displaying offline`, async (t) => {
    const f = fixture();
    t.after(f.stop);
    f.requests[0].resolve(connected());
    await flush();
    await f.advance(FAVICON_POLL_MS);
    f.requests[1].resolve(response());
    await flush();
    assert.deepEqual(f.state(), ["online", "online"], "A single failed probe does not flicker grey.");
    await f.advance(FAVICON_CONFIRM_MS - 1);
    assert.equal(f.requests.length, 2);
    await f.advance(1);
    assert.equal(f.requests.length, 3);
    f.requests[2].resolve(response());
    await flush();
    assert.deepEqual(f.state(), ["offline", "offline"]);
    assert.equal(f.icon.getAttribute("href"), offlinePng);
    assert.equal(f.shortcut.getAttribute("href"), offlinePng);
    assert.equal(f.requests.every(request => request.url === FAVICON_CONNECTIVITY_URL), true);
  });
}

test("favicon treats rejected redirects as failures and clears the failure count after recovery", async (t) => {
  const f = fixture();
  t.after(f.stop);
  f.requests[0].reject(new TypeError("Failed to fetch: redirect not allowed"));
  await flush();
  assert.deepEqual(f.state(), ["unknown", "unknown"]);
  await f.advance(FAVICON_CONFIRM_MS);
  f.requests[1].resolve(connected());
  await flush();
  assert.deepEqual(f.state(), ["online", "online"]);
  await f.advance(FAVICON_POLL_MS);
  f.requests[2].reject(new TypeError("Connection failed"));
  await flush();
  assert.deepEqual(f.state(), ["online", "online"], "Recovery resets earlier failures.");
  await f.advance(FAVICON_CONFIRM_MS);
  f.requests[3].reject(new TypeError("Connection still failed"));
  await flush();
  assert.deepEqual(f.state(), ["offline", "offline"]);
});

test("an offline browser immediately uses embedded PNGs without fetching an image or endpoint", async (t) => {
  const f = fixture(false);
  t.after(f.stop);
  assert.equal(f.requests.length, 0);
  assert.deepEqual(f.state(), ["offline", "offline"]);
  for (const link of [f.icon, f.shortcut]) {
    assert.equal(link.getAttribute("href"), offlinePng);
    assert.equal(link.getAttribute("type"), "image/png");
    assert.equal(link.getAttribute("sizes"), "32x32");
  }
  assert.deepEqual(f.apple.snapshot(), f.originals[2]);
  await f.advance(FAVICON_POLL_MS * 2);
  assert.equal(f.requests.length, 0);
});

test("offline invalidates a pending success and an online event immediately restores original link attributes", async (t) => {
  const f = fixture();
  t.after(f.stop);
  const interrupted = f.requests[0];
  f.navigatorTarget.onLine = false;
  f.event("offline");
  assert.equal(interrupted.init.signal?.aborted, true);
  assert.deepEqual(f.state(), ["offline", "offline"]);
  assert.equal(f.icon.getAttribute("href"), offlinePng);
  interrupted.resolve(connected());
  await flush();
  assert.deepEqual(f.state(), ["offline", "offline"], "Late success cannot recolor an offline tab.");
  assert.equal(f.requests.length, 1, "Changing to offline requires no network request.");
  f.navigatorTarget.onLine = true;
  f.event("online");
  assert.equal(f.requests.length, 2, "Recovery is immediate rather than waiting for the next poll.");
  f.requests[1].resolve(connected());
  await flush();
  assert.deepEqual(f.state(), ["online", "online"]);
  assert.equal(f.icon.getAttribute("href"), onlinePng);
  assert.equal(f.icon.getAttribute("type"), "image/png");
  assert.equal(f.icon.getAttribute("sizes"), "32x32");
  assert.equal(f.shortcut.getAttribute("href"), onlineIco);
  assert.equal(f.shortcut.getAttribute("type"), "image/x-icon");
  assert.equal(f.shortcut.getAttribute("sizes"), null, "An originally absent sizes attribute stays absent.");
  assert.equal(f.timers.size, 1, "Offline polling and the old request timeout were cancelled.");
});

test("timeout aborts an unresponsive fetch, confirms failure, and ignores both late responses", async (t) => {
  const f = fixture();
  t.after(f.stop);
  await f.advance(FAVICON_TIMEOUT_MS);
  assert.equal(f.requests[0].init.signal?.aborted, true);
  assert.deepEqual(f.state(), ["unknown", "unknown"]);
  assert.equal(f.activeRequests(), 0);
  assert.equal(f.timers.size, 1);
  await f.advance(FAVICON_CONFIRM_MS);
  assert.equal(f.requests.length, 2);
  assert.equal(f.activeRequests(), 1);
  await f.advance(FAVICON_TIMEOUT_MS);
  assert.equal(f.requests[1].init.signal?.aborted, true);
  assert.deepEqual(f.state(), ["offline", "offline"]);
  f.requests[0].resolve(connected());
  f.requests[1].resolve(connected());
  await flush();
  assert.deepEqual(f.state(), ["offline", "offline"]);
  assert.equal(f.timers.size, 1);
});

test("hidden tabs cancel probes and resume with one immediate probe when visible", async (t) => {
  const f = fixture(true, true);
  t.after(f.stop);
  assert.equal(f.requests.length, 0);
  assert.equal(f.timers.size, 0);
  await f.advance(FAVICON_POLL_MS * 2);
  assert.equal(f.requests.length, 0);
  f.visibility(false);
  assert.equal(f.requests.length, 1);
  const interrupted = f.requests[0];
  f.visibility(true);
  assert.equal(interrupted.init.signal?.aborted, true);
  assert.equal(f.timers.size, 0);
  interrupted.resolve(connected());
  await flush();
  assert.deepEqual(f.state(), ["unknown", "unknown"]);
  await f.advance(FAVICON_POLL_MS * 2);
  assert.equal(f.requests.length, 1);
  f.visibility(false);
  assert.equal(f.requests.length, 2);
  assert.equal(f.activeRequests(), 1);
  f.requests[1].resolve(connected());
  await flush();
  assert.deepEqual(f.state(), ["online", "online"]);
});

test("pagehide suspends polling and pageshow resumes after discarding the suspended request", async (t) => {
  const f = fixture();
  t.after(f.stop);
  f.event("pagehide");
  assert.equal(f.requests[0].init.signal?.aborted, true);
  assert.equal(f.timers.size, 0);
  f.requests[0].resolve(connected());
  await flush();
  await f.advance(FAVICON_POLL_MS * 2);
  assert.deepEqual(f.state(), ["unknown", "unknown"]);
  assert.equal(f.requests.length, 1);
  f.event("pageshow");
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve(connected());
  await flush();
  assert.deepEqual(f.state(), ["online", "online"]);
});

test("one document has one owner and cleanup removes timers and listeners before allowing a fresh owner", async (t) => {
  const f = fixture();
  t.after(f.stop);
  const duplicate = startFaviconStatus("data:image/png;base64,different", f.environment);
  assert.equal(duplicate, f.stop);
  assert.equal(f.requests.length, 1);
  assert.equal(f.windowTarget.listenerCount, 4);
  assert.equal(f.documentTarget.listenerCount, 1);
  f.navigatorTarget.onLine = false;
  f.event("offline");
  assert.equal(f.icon.getAttribute("href"), offlinePng, "Duplicate startup cannot replace the page's embedded asset.");
  duplicate();
  f.stop();
  assert.equal(f.windowTarget.listenerCount, 0);
  assert.equal(f.documentTarget.listenerCount, 0);
  assert.equal(f.timers.size, 0);
  assert.deepEqual([f.icon.snapshot(), f.shortcut.snapshot(), f.apple.snapshot()], f.originals);
  f.requests[0].resolve(connected());
  await flush();
  f.navigatorTarget.onLine = true;
  f.event("online");
  f.event("pageshow");
  f.visibility(false);
  await f.advance(FAVICON_POLL_MS * 2);
  assert.equal(f.requests.length, 1, "Stopped listeners and late completions cannot create new work.");
  const fresh = startFaviconStatus(offlinePng, f.environment);
  t.after(fresh);
  assert.notEqual(fresh, f.stop);
  assert.equal(f.requests.length, 2);
  assert.equal(f.windowTarget.listenerCount, 4);
  assert.equal(f.documentTarget.listenerCount, 1);
  fresh();
  assert.equal(f.requests[1].init.signal?.aborted, true);
  assert.equal(f.timers.size, 0);
  assert.equal(f.windowTarget.listenerCount + f.documentTarget.listenerCount, 0);
});
