export const FAVICON_CONNECTIVITY_URL = "/api/health/connectivity";
export const FAVICON_POLL_MS = 20_000;
export const FAVICON_TIMEOUT_MS = 5_000;
export const FAVICON_CONFIRM_MS = 2_000;

type Connectivity = "unknown" | "online" | "offline";
export type FaviconEnvironment = {
  document: Document;
  window: Pick<Window, "setTimeout" | "clearTimeout" | "addEventListener" | "removeEventListener">;
  navigator: Pick<Navigator, "onLine">;
  fetch: typeof fetch;
};
const owners = new WeakMap<Document, () => void>();

/** One page-lifetime owner: SPA navigation and React Strict Mode cannot restart it. */
export function startFaviconStatus(offlinePng: string, environment?: FaviconEnvironment): () => void {
  const env = environment ?? { document, window, navigator, fetch: window.fetch.bind(window) };
  const existing = owners.get(env.document);
  if (existing) return existing;
  const links = [...env.document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')].map(link => ({
    link, href: link.getAttribute("href"), type: link.getAttribute("type"), sizes: link.getAttribute("sizes"),
  }));
  let state: Connectivity = "unknown";
  let failures = 0;
  let stopped = false;
  let suspended = false;
  let scheduled: number | null = null;
  let active: { controller: AbortController; timeout: number | null } | null = null;

  // Read anew after every await: the device may disconnect during a probe.
  const isOffline = () => env.navigator.onLine === false;

  function attribute(link: HTMLLinkElement, name: string, value: string | null) {
    if (value === null) link.removeAttribute(name);
    else if (link.getAttribute(name) !== value) link.setAttribute(name, value);
  }
  function show(next: Connectivity) {
    state = next;
    for (const original of links) {
      const { link } = original;
      attribute(link, "href", next === "offline" ? offlinePng : original.href);
      attribute(link, "type", next === "offline" ? "image/png" : original.type);
      attribute(link, "sizes", next === "offline" ? "32x32" : original.sizes);
      attribute(link, "data-sqr-connectivity", next);
    }
  }
  function cancel() {
    if (scheduled !== null) env.window.clearTimeout(scheduled);
    scheduled = null;
    const request = active;
    active = null; // Invalidate before aborting: a late response cannot recolor the icon.
    if (request?.timeout !== null && request?.timeout !== undefined) env.window.clearTimeout(request.timeout);
    request?.controller.abort();
  }
  function schedule(delay: number) {
    if (stopped || suspended || env.document.hidden) return;
    scheduled = env.window.setTimeout(() => { scheduled = null; void check(); }, delay);
  }
  async function check() {
    if (stopped || suspended || env.document.hidden || active) return;
    if (isOffline()) {
      failures = 2;
      show("offline");
      schedule(FAVICON_POLL_MS);
      return;
    }
    const request = { controller: new AbortController(), timeout: null as number | null };
    active = request;
    let delay = FAVICON_POLL_MS;
    try {
      const response = await Promise.race([
        env.fetch(FAVICON_CONNECTIVITY_URL, {
          method: "GET", credentials: "omit", cache: "no-store", redirect: "error",
          signal: request.controller.signal,
        }),
        new Promise<never>((_resolve, reject) => {
          request.timeout = env.window.setTimeout(() => {
            request.controller.abort();
            reject(new Error("Connectivity check timed out"));
          }, FAVICON_TIMEOUT_MS);
        }),
      ]);
      if (stopped || active !== request) return;
      const valid = !request.controller.signal.aborted && !response.redirected
        && response.status === 204 && response.headers.get("X-SQR-Connectivity") === "ok"
        && /(?:^|[,\s])no-store(?:$|[,\s])/i.test(response.headers.get("Cache-Control") ?? "");
      if (!valid) throw new Error("Connectivity response not verified");
      if (isOffline()) { failures = 2; show("offline"); }
      else { failures = 0; show("online"); }
    } catch {
      if (stopped || active !== request) return;
      failures += 1;
      if (isOffline() || failures >= 2) show("offline");
      else delay = FAVICON_CONFIRM_MS; // Confirm a single transient failure before showing grey.
    } finally {
      if (request.timeout !== null) env.window.clearTimeout(request.timeout);
      if (active === request) {
        active = null;
        schedule(delay);
      }
    }
  }
  const offline = () => { cancel(); failures = 2; show("offline"); schedule(FAVICON_POLL_MS); };
  const online = () => { cancel(); void check(); };
  const visibility = () => { cancel(); if (!env.document.hidden) void check(); };
  const pagehide = () => { suspended = true; cancel(); };
  const pageshow = () => { suspended = false; cancel(); void check(); };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancel();
    env.window.removeEventListener("offline", offline);
    env.window.removeEventListener("online", online);
    env.window.removeEventListener("pagehide", pagehide);
    env.window.removeEventListener("pageshow", pageshow);
    env.document.removeEventListener("visibilitychange", visibility);
    show("unknown");
    for (const { link } of links) link.removeAttribute("data-sqr-connectivity");
    owners.delete(env.document);
  };
  owners.set(env.document, stop);
  show(state);
  env.window.addEventListener("offline", offline);
  env.window.addEventListener("online", online);
  env.window.addEventListener("pagehide", pagehide);
  env.window.addEventListener("pageshow", pageshow);
  env.document.addEventListener("visibilitychange", visibility);
  void check();
  return stop;
}
