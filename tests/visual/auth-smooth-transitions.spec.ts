import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import { authV17FixtureIdentity, createAuthV17Fixture } from "../../scripts/lib/auth-v17-browser-fixture.mjs";
import { initializeBrowserThemeFixture, type BrowserThemeFixtureOptions } from "../../scripts/lib/browser-theme-fixture.mjs";

// Actual compiled public pages; fictional loopback HTTP contracts only. Baseline
// mode records the same journeys before the fix without asserting new UI rules.
test.use({ serviceWorkers: "block" });
test.describe.configure({ retries: 0 });
const baseline = process.env.SQR_AUTH_TRANSITIONS_BASELINE === "1" || process.env.SQR_AUTH_BASELINE === "1";
type Theme = "light" | "dark";
type TransitionRecord = {
  kind: string | null; rootName: string; slotBefore: string | null; started: number; readyAt?: number;
  readyObserverWorkMs?: number; finished?: number;
  page?: { slotAfter: string | null; oldBlend: string; newBlend: string; oldAnimation: string; newAnimation: string };
  snapshotGeometry?: { at: number; viewportWidth: number; viewportHeight: number; scrollWidth: number; scrollHeight: number;
    group: { width: string; height: string }; old: { width: string; height: string }; next: { width: string; height: string } };
};
type MotionRecord = {
  source: "animation" | "transition" | "web-animation"; name: string; targetClass: string; pseudo: string | null;
  at: number; started: number | null; finished?: number; cancelled?: boolean; duration: number | null;
  delay: number; iterations: number | "infinite"; endTime: number | null; properties: string[]; errorReveal: boolean;
};
type ShiftRect = { x: number; y: number; width: number; height: number; top: number; right: number; bottom: number; left: number };
type LayoutShiftDiagnostic = {
  value: number; startTime: number; deliveredAt: number; hadRecentInput: boolean | null;
  viewport: { width: number; height: number; scrollX: number; scrollY: number };
  sources: Array<{ node: { tag: string; id: string; className: string } | null;
    previousRect: ShiftRect | null; currentRect: ShiftRect | null }>;
};
type TransitionProbe = {
  native: boolean;
  transitions: TransitionRecord[];
  animations: Array<{ name: string; pathname: string; started: number }>;
  effects: Array<{ kind: string | null; name: string; pseudo: string | null; endTime: number; travel: number; properties: string[] }>;
  shifts: number[];
  layoutDiagnostics: LayoutShiftDiagnostic[]; layoutDiagnosticsDropped: number; lastAuthNavigationAt: number | null;
  longTasksSupported: boolean; longTasks: Array<{ start: number; duration: number }>;
  longTasksDropped: number; motion: MotionRecord[]; motionDropped: number;
};
type ProbeWindow = Window & { __authTransitionProbe: TransitionProbe; __flushAuthPerformance?: () => void };
const strictPolicy = "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-elem 'self'; style-src-attr 'none'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; trusted-types default sqr-ui dompurify; require-trusted-types-for 'script'";
const viewports = [
  { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 412, height: 915 },
  { width: 768, height: 1024 }, { width: 1440, height: 900 },
];
// Phase 9 expands responsive coverage without changing the Phase 4 anchor set.
const responsiveViewports = [
  { width: 320, height: 800 }, { width: 360, height: 800 }, { width: 390, height: 844 },
  { width: 412, height: 915 }, { width: 768, height: 1024 }, { width: 1024, height: 900 },
  { width: 1440, height: 900 },
];

async function installFixture(page: Page, baseURL: string | undefined, options: {
  theme?: Theme; reducedMotion?: boolean; noViewTransitions?: boolean;
  performanceMode?: BrowserThemeFixtureOptions["performanceMode"]; performanceProbe?: boolean; attributionProbe?: boolean;
} = {}) {
  expect(baseURL, "Use an isolated compiled frontend").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).port).not.toBe("");
  const fixture = createAuthV17Fixture(origin);
  const state: {
    forgotGate: Promise<void> | null;
    verifyGate: Promise<void> | null;
    forgotResult: "success" | "temporary";
    mutations: Array<{ path: string; body: Record<string, unknown> }>;
  } = { forgotGate: null, verifyGate: null, forgotResult: "success", mutations: [] };
  const errors: string[] = [], pending = new Set<Promise<void>>();
  await page.emulateMedia({ colorScheme: options.theme ?? "dark", reducedMotion: options.reducedMotion ? "reduce" : "no-preference" });
  await page.addInitScript<BrowserThemeFixtureOptions>(initializeBrowserThemeFixture,
    { origin, mode: "preserve-choice", theme: options.theme ?? "dark", performanceMode: options.performanceMode ?? "high" });
  await page.addInitScript(({ expectedOrigin, disable, capturePerformance, captureAttribution }) => {
    if (location.origin !== expectedOrigin) return;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    const doc = document as Document & { startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void>; ready?: Promise<void> } };
    const probe: TransitionProbe = { native: typeof doc.startViewTransition === "function", transitions: [], animations: [], effects: [], shifts: [],
      layoutDiagnostics: [], layoutDiagnosticsDropped: 0, lastAuthNavigationAt: null,
      longTasksSupported: capturePerformance && PerformanceObserver.supportedEntryTypes.includes("longtask"),
      longTasks: [], longTasksDropped: 0, motion: [], motionDropped: 0 };
    (window as unknown as ProbeWindow).__authTransitionProbe = probe;
    const seenMotion = new WeakSet<Animation>();
    const recordMotion = (animation: Animation) => {
      if (!capturePerformance || seenMotion.has(animation) || !(animation.effect instanceof KeyframeEffect)) return;
      const effect = animation.effect, element = effect.target;
      if (!(element instanceof Element)) return;
      const snapshot = element === document.documentElement && Boolean(document.documentElement.dataset.vt);
      if (!snapshot && !element.closest(".auth-v17")) return;
      seenMotion.add(animation);
      if (probe.motion.length >= 256) { probe.motionDropped++; return; }
      const timing = effect.getTiming(), end = Number(effect.getComputedTiming().endTime), iterations = timing.iterations ?? 1;
      const source = animation instanceof CSSTransition ? "transition" : animation instanceof CSSAnimation ? "animation" : "web-animation";
      const name = animation instanceof CSSTransition ? animation.transitionProperty
        : animation instanceof CSSAnimation ? animation.animationName : animation.id;
      const record: MotionRecord = { source, name, targetClass: (element.getAttribute("class") ?? "").slice(0, 160),
        pseudo: effect.pseudoElement, at: performance.now(), started: typeof animation.startTime === "number" ? animation.startTime : null,
        duration: typeof timing.duration === "number" ? timing.duration : null, delay: timing.delay ?? 0,
        iterations: Number.isFinite(iterations) ? iterations : "infinite", endTime: Number.isFinite(end) ? end : null,
        properties: [...new Set(effect.getKeyframes().flatMap(frame => Object.keys(frame)))]
          .filter(property => !["offset", "computedOffset", "easing", "composite"].includes(property)),
        errorReveal: element.matches(".auth-error") && name === "auth-error-reveal" };
      probe.motion.push(record);
      void animation.finished.then(() => { record.finished = performance.now(); }, () => {
        record.finished = performance.now(); record.cancelled = true;
      });
    };
    if (probe.longTasksSupported) {
      const consume = (entries: PerformanceEntry[]) => {
        for (const entry of entries) {
          if (probe.longTasks.length < 128) probe.longTasks.push({ start: entry.startTime, duration: entry.duration });
          else probe.longTasksDropped++;
        }
      };
      const observer = new PerformanceObserver(list => consume(list.getEntries()));
      observer.observe({ type: "longtask", buffered: true });
      (window as unknown as ProbeWindow).__flushAuthPerformance = () => consume(observer.takeRecords());
    }
    const start = doc.startViewTransition?.bind(doc);
    if (disable) Object.defineProperty(document, "startViewTransition", { configurable: true, value: undefined });
    else if (start) {
      Object.defineProperty(document, "startViewTransition", { configurable: true, value: (update: () => void | Promise<void>) => {
        const previousSlot = document.querySelector(".auth-form-slot");
        const record: TransitionRecord = { kind: document.documentElement.dataset.vt ?? null,
          rootName: getComputedStyle(document.documentElement).getPropertyValue("view-transition-name"),
          slotBefore: previousSlot ? getComputedStyle(previousSlot).getPropertyValue("view-transition-name") : null,
          started: performance.now() };
        probe.transitions.push(record);
        const transition = start(update);
        void transition.ready?.then(() => {
          const observerStartedAt = performance.now();
          record.readyAt = observerStartedAt;
          try {
          if (record.kind === "page") {
            const slot = document.querySelector(".auth-form-slot");
            const oldRoot = getComputedStyle(document.documentElement, "::view-transition-old(root)");
            const newRoot = getComputedStyle(document.documentElement, "::view-transition-new(root)");
            record.page = { slotAfter: slot ? getComputedStyle(slot).getPropertyValue("view-transition-name") : null,
              oldBlend: oldRoot.mixBlendMode, newBlend: newRoot.mixBlendMode,
              oldAnimation: oldRoot.animationName, newAnimation: newRoot.animationName };
            if (captureAttribution) {
              const group = getComputedStyle(document.documentElement, "::view-transition-group(root)");
              record.snapshotGeometry = { at: performance.now(), viewportWidth: innerWidth, viewportHeight: innerHeight,
                scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
                group: { width: group.width, height: group.height }, old: { width: oldRoot.width, height: oldRoot.height },
                next: { width: newRoot.width, height: newRoot.height } };
            }
          }
          for (const animation of document.getAnimations()) {
            recordMotion(animation);
            const name = (animation as CSSAnimation).animationName;
            if (!["auth-in", "auth-out", "fade-in", "auth-page-in"].includes(name) || !animation.effect) continue;
            const effect = animation.effect as KeyframeEffect;
            const frames = effect.getKeyframes();
            const travel = Math.max(0, ...frames.map(frame => {
              const matrix = typeof frame.transform === "string" && frame.transform !== "none"
                ? new DOMMatrixReadOnly(frame.transform) : new DOMMatrixReadOnly();
              return Math.hypot(matrix.m41, matrix.m42);
            }));
            probe.effects.push({ kind: record.kind, name, pseudo: effect.pseudoElement,
              endTime: Number(effect.getComputedTiming().endTime), travel,
              properties: [...new Set(effect.getKeyframes().flatMap(frame => Object.keys(frame)))]
                .filter(property => !["offset", "computedOffset", "easing", "composite"].includes(property)) });
          }
          } finally { record.readyObserverWorkMs = performance.now() - observerStartedAt; }
        }, () => undefined);
        // The test observer handles both outcomes; application rejection handling
        // remains observable through pageerror/unhandledrejection.
        void transition.finished.then(() => { record.finished = performance.now(); }, () => { record.finished = performance.now(); });
        return transition;
      } });
    }
    document.addEventListener("animationstart", event => {
      if ((event.target as Element | null)?.closest(".auth-v17")) {
        probe.animations.push({ name: event.animationName, pathname: location.pathname, started: performance.now() });
        if (capturePerformance && event.target instanceof Element) for (const animation of event.target.getAnimations()) recordMotion(animation);
      }
    });
    if (capturePerformance) document.addEventListener("transitionrun", event => {
      if (event.target instanceof Element && event.target.closest(".auth-v17")) {
        for (const animation of event.target.getAnimations()) recordMotion(animation);
      }
    });
    document.addEventListener("click", event => {
      if (event.target instanceof Element && event.target.closest('a[href="/login"], a[href="/forgot-password"]')) {
        probe.lastAuthNavigationAt = performance.now();
      }
    }, true);
    if (PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
      new PerformanceObserver(list => {
        const rect = (value: DOMRectReadOnly | undefined): ShiftRect | null => value ? ({ x: value.x, y: value.y,
          width: value.width, height: value.height, top: value.top, right: value.right, bottom: value.bottom, left: value.left }) : null;
        for (const raw of list.getEntries()) {
          const entry = raw as PerformanceEntry & { value: number; hadRecentInput?: boolean;
            sources?: Array<{ node?: Node | null; previousRect?: DOMRectReadOnly; currentRect?: DOMRectReadOnly }> };
          probe.shifts.push(entry.value);
          if (probe.layoutDiagnostics.length >= 32) { probe.layoutDiagnosticsDropped++; continue; }
          probe.layoutDiagnostics.push({ value: entry.value, startTime: entry.startTime, deliveredAt: performance.now(),
            hadRecentInput: typeof entry.hadRecentInput === "boolean" ? entry.hadRecentInput : null,
            viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY },
            sources: Array.from(entry.sources ?? []).slice(0, 5).map(source => ({
              node: source.node instanceof Element ? { tag: source.node.tagName.toLowerCase(),
                id: source.node.id.slice(0, 120), className: (source.node.getAttribute("class") ?? "").slice(0, 160) } : null,
              previousRect: rect(source.previousRect), currentRect: rect(source.currentRect),
            })) });
        }
      }).observe({ type: "layout-shift" });
    }
  }, { expectedOrigin: origin, disable: options.noViewTransitions ?? false, capturePerformance: options.performanceProbe ?? false,
    captureAttribution: options.attributionProbe ?? false });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const url = new URL(message.location().url || origin, origin), text = message.text();
    if (url.origin === origin && /^(?:\/api\/me|\/api\/auth\/login|\/api\/auth\/request-password-reset)$/.test(url.pathname)
      && /status of (?:401|503)/.test(text)) return;
    if (url.origin === origin && url.pathname === "/api/auth/verify-two-factor-login"
      && state.mutations.some(mutation => mutation.path === url.pathname) && text.includes("status of 401")) return;
    errors.push(text);
  });
  await page.context().routeWebSocket("**/*", socket => { errors.push("Public auth opened a protected WebSocket"); socket.close(); });
  const handle = async (route: Route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { errors.push(`Off-origin ${url.origin}${url.pathname}`); return route.abort(); }
    if (url.pathname === "/api/maintenance-status" && request.method() === "GET") return route.fulfill({ json: { maintenance: false } });
    if (url.pathname.startsWith("/api/telemetry/") && ["GET", "POST"].includes(request.method())) return route.fulfill({ json: { ok: true } });
    if (request.isNavigationRequest() && request.resourceType() === "document") {
      if (request.method() !== "GET") { errors.push("Unexpected document method"); return route.abort(); }
      // APIRequestContext can follow redirects outside the browser route guard.
      const response = await route.fetch({ maxRedirects: 0, timeout: 20_000 });
      if (response.status() !== 200) {
        errors.push(`Unexpected document HTTP ${response.status()}`);
        await response.dispose();
        return route.abort();
      }
      const headers = response.headers();
      headers["content-security-policy"] = [headers["content-security-policy"], strictPolicy].filter(Boolean).join(", ");
      return route.fulfill({ response, headers });
    }
    if (request.method() === "POST" && url.pathname.startsWith("/api/auth/")) {
      state.mutations.push({ path: url.pathname, body: request.postDataJSON() });
    }
    if (url.pathname === "/api/auth/verify-two-factor-login" && request.method() === "POST" && state.verifyGate) {
      await state.verifyGate;
    }
    if (url.pathname === "/api/auth/request-password-reset" && request.method() === "POST") {
      fixture.state.counts.forgot++;
      const gate = state.forgotGate, result = state.forgotResult;
      if (gate) await gate;
      if (result === "temporary") return route.fulfill({ status: 503, json: {
        ok: false, message: "Synthetic temporary recovery failure.", error: { code: "SERVICE_UNAVAILABLE", message: "Synthetic temporary recovery failure." },
      } });
      // Both fictional identifiers receive this exact same generic response.
      return route.fulfill({ json: { ok: true, message: "If the account exists, its administrator will review the request." } });
    }
    return fixture.route(route);
  };
  await page.context().route("**/*", route => {
    const work = handle(route).finally(() => pending.delete(work)); pending.add(work); return work;
  });
  return { fixture, state, async finish() {
    while (pending.size) await Promise.all(pending);
    await page.context().unrouteAll({ behavior: "wait" });
    expect(fixture.state.unexpected, "Every API has an explicit fictional contract").toEqual([]);
    expect(errors, "No page, CSP, Trusted Types or unhandled transition errors").toEqual([]);
  } };
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation => {
      const timing = animation.effect?.getComputedTiming();
      return timing && Number.isFinite(Number(timing.endTime));
    }).map(animation => animation.finished.catch(() => undefined)));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function navigateAuth(page: Page, destination: "login" | "forgot-password") {
  if (baseline) {
    const name = destination === "forgot-password" ? /^(?:Lupa kata laluan\?|Forgot password\?)$/i : /^(?:Kembali ke log masuk|Back to sign in)$/i;
    await page.getByRole("button", { name }).click();
  } else {
    await page.locator(`.auth-v17 a[href="/${destination}"]`).first().click();
  }
  await expect(page).toHaveURL(new RegExp(`/${destination}$`));
  await expect(page.locator("#auth-v17-title")).toBeVisible();
  await settle(page);
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const bounds = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height,
        right: box.right + scrollX, bottom: box.bottom + scrollY };
    };
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing auth geometry anchor ${selector}`);
      return bounds(element);
    };
    const art = document.querySelector(".auth-v17-art");
    const artVisible = !!art && getComputedStyle(art).display !== "none" && art.getBoundingClientRect().height > 0;
    const slot = document.querySelector(".auth-form-slot");
    const tagline = document.querySelector(".auth-v17-brand small");
    const intro = document.querySelector(".auth-v17-intro");
    const fields = Array.from(document.querySelectorAll(".auth-v17-content form label, .auth-v17-content form input, .auth-v17-content form button"))
      .filter(element => getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden"
        && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0
        && (element.tagName !== "BUTTON" || Boolean(element.textContent?.trim())))
      .map(element => ({ tag: element.tagName.toLowerCase(), id: element.id || element.getAttribute("for"),
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize), box: bounds(element) }));
    const artImages = Array.from(art?.querySelectorAll("img") ?? [], image => {
      const box = bounds(image), style = getComputedStyle(image);
      // The shared artwork uses centered object-fit:contain. Measure the
      // rendered canvas rather than mistaking the full-size img box for it.
      const scale = image.naturalWidth > 0 && image.naturalHeight > 0
        ? Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight) : 0;
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      const x = box.x + (box.width - width) / 2, y = box.y + (box.height - height) / 2;
      return { src: image.getAttribute("src"), fit: style.objectFit, position: style.objectPosition,
        complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, box,
        rendered: { x, y, width, height, right: x + width, bottom: y + height } };
    });
    return {
      heading: rect("#auth-v17-title"), brand: rect(".auth-v17-brand-panel"), side: rect(".auth-v17-side"),
      topbar: rect(".auth-v17-topline"), logo: rect(".auth-v17-logo"),
      slot: slot ? bounds(slot) : rect(".auth-v17-view"), slotPresent: Boolean(slot),
      tagline: tagline && getComputedStyle(tagline).display !== "none" ? bounds(tagline) : null,
      taglineText: tagline?.textContent?.trim() ?? "", introFont: intro ? Number.parseFloat(getComputedStyle(intro).fontSize) : 0,
      artVisible, artFrame: artVisible && art ? bounds(art) : null, artImages, fields,
      inputFont: Number.parseFloat(getComputedStyle(document.querySelector("input")!).fontSize),
      rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      measuredAt: performance.now(), timeOrigin: performance.timeOrigin,
      viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
    };
  });
}

type AuthGeometryBox = Awaited<ReturnType<typeof geometry>>["heading"];
function expectContained(child: AuthGeometryBox, parent: AuthGeometryBox, label: string) {
  expect(child.x, `${label}/left`).toBeGreaterThanOrEqual(parent.x - 1);
  expect(child.y, `${label}/top`).toBeGreaterThanOrEqual(parent.y - 1);
  expect(child.right, `${label}/right`).toBeLessThanOrEqual(parent.right + 1);
  expect(child.bottom, `${label}/bottom`).toBeLessThanOrEqual(parent.bottom + 1);
}

function report(testInfo: TestInfo, label: string, data: unknown) {
  const value = { test: testInfo.title, baseline, label, data };
  console.log("AUTH_TRANSITION_EVIDENCE=" + JSON.stringify(value));
}

async function recordScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`auth-transitions-${baseline ? "before" : "after"}-${name}.jpg`), type: "jpeg", quality: 70, animations: "disabled", fullPage: true });
}

test("Auth smooth anchor: shared heading origin at five widths", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const { finish } = await installFixture(page, baseURL, { reducedMotion: true });
  const follow = async (destination: "login" | "forgot-password") => {
    const anchor = page.locator(`.auth-v17 a[href="/${destination}"]`).first();
    if (await anchor.count()) await anchor.click();
    else await page.getByRole("button", { name: destination === "forgot-password"
      ? /^(?:Lupa kata laluan\?|Forgot password\?)$/i : /^(?:Kembali ke log masuk|Back to sign in)$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/${destination}$`));
    await expect(page.locator("#auth-v17-title")).toBeVisible(); await settle(page);
  };
  try {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport); await page.goto("/login", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#auth-v17-title")).toBeVisible(); await settle(page);
      const brand = await page.locator(".auth-v17-brand-panel").elementHandle();
      const topbar = await page.locator(".auth-v17-topline").elementHandle();
      const before = await geometry(page);
      await follow("forgot-password");
      const after = await geometry(page);
      const identity = {
        brand: await page.locator(".auth-v17-brand-panel").evaluate((element, previous) => element === previous, brand),
        topbar: await page.locator(".auth-v17-topline").evaluate((element, previous) => element === previous, topbar),
      };
      report(testInfo, `${viewport.width}px anchor`, { before, after, identity });
      if (!baseline) {
        expect(identity).toEqual({ brand: true, topbar: true });
        expect(Math.abs(after.heading.y - before.heading.y), "Both routes share their heading origin").toBeLessThanOrEqual(1);
        expect(before.documentWidth).toBeLessThanOrEqual(viewport.width + 1);
        expect(after.documentWidth).toBeLessThanOrEqual(viewport.width + 1);
      }
      await follow("login");
      if (!baseline) expect(Math.abs((await geometry(page)).heading.y - before.heading.y)).toBeLessThanOrEqual(1);
      await brand?.dispose(); await topbar?.dispose();
    }
  } finally { await finish(); }
});

for (const theme of ["light", "dark"] as const) {
  test(`Auth smooth geometry ${theme}: persistent shell, readable controls and aligned headings at seven responsive widths`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    const { fixture, finish } = await installFixture(page, baseURL, { theme, reducedMotion: true });
    try {
      for (const viewport of responsiveViewports) {
        await page.setViewportSize(viewport);
        await page.goto("/login", { waitUntil: "domcontentloaded" });
        await expect(page.locator("#auth-v17-title")).toBeVisible(); await settle(page);
        if (!baseline) {
          await page.locator(".auth-v17-art img").evaluateAll(async elements => {
            await Promise.all(elements.map(element => (element as HTMLImageElement).decode()));
          });
          await settle(page);
        }
        for (const locale of ["ms", "en"] as const) {
          await page.getByRole("button", { name: locale === "en" ? "English" : "Bahasa Melayu", exact: true }).click();
          const brand = await page.locator(".auth-v17-brand-panel").elementHandle();
          const topbar = await page.locator(".auth-v17-topline").elementHandle();
          const images = await page.locator(".auth-v17-art img").elementHandles();
          const before = await geometry(page);
          const shiftsResetAt = await page.evaluate(() => {
            (window as unknown as ProbeWindow).__authTransitionProbe.shifts.length = 0;
            return performance.now();
          });
          if (locale === "en") await recordScreenshot(page, testInfo, `login-${theme}-${viewport.width}`);
          const navigationRequestedAt = await page.evaluate(() => performance.now());
          await navigateAuth(page, "forgot-password");
          const after = await geometry(page);
          const identity = {
            brand: await page.locator(".auth-v17-brand-panel").evaluate((element, previous) => element === previous, brand),
            topbar: await page.locator(".auth-v17-topline").evaluate((element, previous) => element === previous, topbar),
            images: await Promise.all(images.map((image, index) => page.locator(".auth-v17-art img").nth(index)
              .evaluate((element, previous) => element === previous, image))),
          };
          const observed = await page.evaluate(() => {
            const probe = (window as unknown as ProbeWindow).__authTransitionProbe;
            return { shifts: probe.shifts, diagnostics: probe.layoutDiagnostics, diagnosticsDropped: probe.layoutDiagnosticsDropped,
              navigationStartedAt: probe.lastAuthNavigationAt, observedAt: performance.now(), timeOrigin: performance.timeOrigin };
          });
          const shifts = observed.shifts;
          report(testInfo, `${viewport.width}/${locale}`, { before, after, identity, imageCount: images.length, shifts,
            shiftsResetAt, navigationRequestedAt, screenshotWindow: locale === "en" ? { from: shiftsResetAt, to: navigationRequestedAt } : null,
            observed });
          if (!baseline) {
            expect(identity.brand, "Brand node survives route navigation").toBe(true);
            expect(identity.topbar, "Top bar node survives route navigation").toBe(true);
            expect(images.length, "Exactly the two original decorative variants remain mounted").toBe(2);
            expect(identity.images.every(Boolean), "All illustration nodes survive route navigation").toBe(true);
            expect(Math.abs(after.heading.y - before.heading.y), "Headings use the same document Y").toBeLessThanOrEqual(1);
            expect(Math.abs(after.slot.height - before.slot.height), "The taller localized form remains reserved on both routes").toBeLessThanOrEqual(1);
            expect(shifts.reduce((sum, value) => sum + value, 0), "Auth navigation has zero layout shift, including input-adjacent shifts").toBe(0);
            for (const current of [before, after]) {
              expect(current.documentWidth).toBeLessThanOrEqual(viewport.width + 1);
              expect(current.logo.width).toBeGreaterThan(0);
              expect(current.logo.height).toBeGreaterThan(0);
              expectContained(current.logo, current.brand, "Logo within branding");
              expect(current.taglineText).not.toBe("");
              if (!current.tagline) throw new Error("The original branding tagline is not rendered");
              expect(current.tagline.width).toBeGreaterThan(0);
              expect(current.tagline.height).toBeGreaterThan(0);
              expectContained(current.tagline, current.brand, "Tagline within branding");
              expectContained(current.topbar, current.side, "Toolbar within form column");
              expect(current.slotPresent, "Both routes retain the shared form slot").toBe(true);
              expectContained(current.heading, current.slot, "Heading within form slot");
              expect(current.fields.some(field => field.tag === "label")).toBe(true);
              expect(current.fields.some(field => field.tag === "input")).toBe(true);
              expect(current.fields.some(field => field.tag === "button")).toBe(true);
              for (const field of current.fields) expectContained(field.box, current.slot, `Form ${field.tag}/${field.id}`);
              if (viewport.width < 768) {
                expect(current.artVisible, "Small screens use compact branding").toBe(false);
                expect(current.brand.height, "Compact header keeps only the original logo and tagline").toBeLessThanOrEqual(128);
                expect(current.side.y).toBeGreaterThanOrEqual(current.brand.y + current.brand.height - 1);
                expect(current.inputFont, "Phone input text prevents automatic browser zoom").toBeGreaterThanOrEqual(16);
                for (const field of current.fields) {
                  expect(field.fontSize, `Readable phone ${field.tag}/${field.id}`).toBeGreaterThanOrEqual(16);
                  if (field.tag !== "label") expect(field.box.height, `Phone ${field.tag} target height`).toBeGreaterThanOrEqual(44);
                }
              } else {
                // Chromium distributes fractional grid tracks in 1/64px units.
                expect(current.brand.width + 1 / 64).toBeGreaterThanOrEqual(viewport.width * 0.4);
                expect(current.artVisible).toBe(true);
                if (!current.artFrame) throw new Error("Desktop artwork does not have a rendered frame");
                expect(current.artFrame.width).toBeGreaterThan(0);
                expect(current.artFrame.height).toBeGreaterThan(0);
                expectContained(current.artFrame, current.brand, "Artwork frame within branding");
                expect(current.artImages).toHaveLength(2);
                for (const image of current.artImages) {
                  expect(image.complete).toBe(true);
                  expect(image.naturalWidth).toBeGreaterThan(0);
                  expect(image.naturalHeight).toBeGreaterThan(0);
                  expect(image.fit).toBe("contain");
                  expect(image.position).toBe("50% 50%");
                  expect(image.rendered.width).toBeGreaterThan(0);
                  expect(image.rendered.height).toBeGreaterThan(0);
                  expectContained(image.rendered, current.artFrame, "Entire original artwork canvas within frame");
                }
                if (viewport.width >= 1024) {
                  expect(Math.abs(current.brand.width / current.side.width - 1.15), "Desktop split approximates 1.15fr/1fr").toBeLessThanOrEqual(0.05);
                  expect(current.slot.width / current.rem, "Desktop form measure is about 24rem").toBeGreaterThanOrEqual(23);
                  expect(current.slot.width / current.rem).toBeLessThanOrEqual(25);
                  expect(current.introFont, "Desktop brand headline follows the supplied 36–40px scale").toBeGreaterThanOrEqual(36);
                  expect(current.introFont).toBeLessThanOrEqual(40);
                }
              }
            }
            await expect(page.locator(".auth-v17")).toHaveAttribute("data-theme", theme);
            await expect(page.getByRole("button", { name: locale === "en" ? "English" : "Bahasa Melayu", exact: true })).toHaveAttribute("aria-pressed", "true");
            await expect(page.locator("#auth-v17-title")).toBeFocused();
          }
          if (locale === "en") await recordScreenshot(page, testInfo, `forgot-${theme}-${viewport.width}`);
          await navigateAuth(page, "login");
          if (!baseline) {
            expect(Math.abs((await geometry(page)).heading.y - before.heading.y)).toBeLessThanOrEqual(1);
            expect(await brand!.evaluate(element => element.isConnected)).toBe(true);
            await expect(page.locator("#auth-v17-title")).toBeFocused();
          }
          await brand?.dispose(); await topbar?.dispose();
          for (const image of images) await image.dispose();
        }
      }
      expect(fixture.state.counts).toEqual({ login: 0, verify: 0, forgot: 0, reset: 0, validate: 0 });
    } finally { await finish(); }
  });
}

test("Auth smooth links: native modifiers, unchanged replace history and browser traversal", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(75_000);
  const { finish } = await installFixture(page, baseURL, { noViewTransitions: true });
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#auth-v17-title")).toBeVisible(); await settle(page);
    const historyLength = await page.evaluate(() => history.length);
    const anchor = page.locator('.auth-v17 a[href="/forgot-password"]');
    if (!baseline) {
      await expect(anchor).toHaveCount(1);
      for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey", "middle"] as const) {
        const intercepted = await anchor.evaluate((element, key) => {
          let prevented: boolean | null = null;
          const inspect = (event: MouseEvent) => { prevented = event.defaultPrevented; event.preventDefault(); };
          document.addEventListener("click", inspect, { once: true });
          const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: key === "middle" ? 1 : 0,
            ctrlKey: key === "ctrlKey", metaKey: key === "metaKey", shiftKey: key === "shiftKey", altKey: key === "altKey" });
          element.dispatchEvent(event);
          document.removeEventListener("click", inspect);
          return prevented;
        }, modifier);
        expect(intercepted, `${modifier} keeps the browser's native link action`).toBe(false);
        await expect(page).toHaveURL(/\/login$/);
      }
    }
    await navigateAuth(page, "forgot-password");
    expect(await page.evaluate(() => history.length), "Existing ordinary navigation replaces history").toBe(historyLength);
    await navigateAuth(page, "login");
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    // Seed real browser entries independently: ordinary public navigation uses
    // replaceState and must keep doing so, rather than adding entries for motion.
    const traversal: Array<{ label: string; pathname: string; title: string | null; login: boolean; forgot: boolean }> = [];
    const recordTraversal = async (label: string) => {
      traversal.push(await page.evaluate(step => ({ label: step, pathname: location.pathname,
        title: document.querySelector("#auth-v17-title")?.textContent ?? null,
        login: !!document.querySelector("#login-username"), forgot: !!document.querySelector("#forgot-password-identifier") }), label));
    };
    for (const pathname of ["/forgot-password", "/login"]) {
      await page.evaluate(path => { history.pushState(null, "", path); dispatchEvent(new PopStateEvent("popstate")); }, pathname);
      await expect(page).toHaveURL(new RegExp(`${pathname}$`)); await settle(page);
      await recordTraversal(`seed ${pathname}`);
    }
    await page.goBack(); await expect(page).toHaveURL(/\/forgot-password$/);
    if (!baseline) await expect(page.locator("#forgot-password-identifier")).toBeVisible();
    await settle(page); await recordTraversal("back");
    if (!baseline) await expect(page.locator("#auth-v17-title")).toBeFocused();
    await page.goForward(); await expect(page).toHaveURL(/\/login$/);
    if (!baseline) await expect(page.locator("#login-username")).toBeVisible();
    await settle(page); await recordTraversal("forward");
    if (!baseline) await expect(page.locator("#auth-v17-title")).toBeFocused();
    report(testInfo, "history", { historyLength, finalLength: await page.evaluate(() => history.length), traversal });
  } finally { await finish(); }
});

for (const reducedMotion of [false, true]) {
  test(`Auth smooth fallback ${reducedMotion ? "reduced" : "animated"}: one enter animation survives preference re-renders`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const { finish } = await installFixture(page, baseURL, { noViewTransitions: !reducedMotion, reducedMotion });
    try {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#auth-v17-title")).toBeVisible(); await settle(page);
      if (!baseline) {
        expect(await page.locator("input:focus").count(), "First mount does not open the phone keyboard").toBe(0);
        await expect(page.locator("#auth-v17-title"), "First document load preserves the user's focus").not.toBeFocused();
      }
      await navigateAuth(page, "forgot-password");
      const snapshot = async () => page.evaluate(() => {
        const probe = (window as unknown as ProbeWindow).__authTransitionProbe;
        const enter = document.querySelector(".auth-form-enter");
        return { transitions: probe.transitions, starts: probe.animations.filter(item => item.pathname === "/forgot-password" && item.name === "auth-in").length,
          opacity: enter ? getComputedStyle(enter).opacity : null,
          animation: enter ? getComputedStyle(enter).animationDuration : null,
          active: document.getAnimations().filter(item => item.playState === "running").map(item => Number(item.effect?.getComputedTiming().endTime)) };
      });
      const before = await snapshot();
      await page.getByRole("button", { name: "English", exact: true }).click();
      await page.locator(".auth-v17-theme").click(); await settle(page);
      const after = await snapshot(); report(testInfo, "fallback", { reducedMotion, before, after });
      if (!baseline) {
        expect(after.transitions).toEqual([]);
        expect(after.opacity).toBe("1");
        expect(after.starts, "Preference changes do not restart the completed route entry").toBe(before.starts);
        if (reducedMotion) {
          expect(after.active.every(duration => duration <= 1)).toBe(true);
          expect(Number.parseFloat(after.animation ?? "0") * 1000).toBeLessThanOrEqual(1);
        } else expect(before.starts, "Unsupported browsers get one entry animation").toBe(1);
      }
    } finally { await finish(); }
  });
}

test("Auth smooth native: rapid navigation settles focus and does not replay after VT cleanup", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(75_000);
  const { fixture, finish } = await installFixture(page, baseURL);
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#auth-v17-title")).toBeVisible(); await settle(page);
    const supported = await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe.native);
    test.skip(!supported, "The installed browser does not implement native View Transitions; fallback is separately covered");
    if (baseline) {
      await navigateAuth(page, "forgot-password"); await navigateAuth(page, "login");
    } else {
      for (const destination of ["forgot-password", "login", "forgot-password", "login"] as const) {
        // Invoke the actual anchor handler before the previous snapshot overlay
        // finishes; this checks overlapping transitions without forced UI waits.
        await page.locator(`.auth-v17 a[href="/${destination}"]`).first().evaluate(element => (element as HTMLAnchorElement).click());
        await expect(page).toHaveURL(new RegExp(`/${destination}$`));
      }
      await settle(page);
      await expect(page.locator("html")).not.toHaveAttribute("data-vt");
      await expect(page.locator("#auth-v17-title")).toBeFocused();
      await expect(page.locator("input:focus")).toHaveCount(0);
    }
    const before = await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe);
    await page.getByRole("button", { name: "English", exact: true }).click();
    await settle(page);
    const after = await page.evaluate(() => ({ probe: (window as unknown as ProbeWindow).__authTransitionProbe,
      opacity: getComputedStyle(document.querySelector(".auth-form-slot, .auth-v17-view")!).opacity }));
    report(testInfo, "native", { before, after });
    if (!baseline) {
      expect(after.probe.transitions.length, "Rapid navigation uses the supported native path").toBeGreaterThan(0);
      expect(after.probe.transitions.every(item => item.kind === "auth" && item.finished !== undefined)).toBe(true);
      expect(after.probe.transitions.every(item => item.rootName === "none"), "Persistent chrome stays live outside the snapshots").toBe(true);
      expect(after.probe.effects.length, "The native animation is observable").toBeGreaterThan(0);
      for (const effect of after.probe.effects) {
        expect(effect.endTime, "Auth snapshot motion ends within 400 ms including its delay").toBeLessThanOrEqual(400);
        expect(effect.travel, "Auth snapshots travel at most 10 CSS pixels").toBeLessThanOrEqual(10);
        expect(effect.properties.every(property => ["opacity", "transform"].includes(property)), "Snapshot motion uses only composited properties").toBe(true);
      }
      expect(after.probe.animations.length, "VT cleanup and unrelated renders do not add fallback entry animations").toBe(before.animations.length);
      expect(after.opacity).toBe("1");
    }
    expect(fixture.state.counts.login + fixture.state.counts.forgot).toBe(0);
  } finally { await finish(); }
});

for (const mode of ["native", "unsupported", "reduced"] as const) {
  test(`Auth smooth landing: ${mode} page boundaries preserve theme, links and replace history`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(baseline && mode !== "native", "Record the unchanged baseline journey once");
    await page.setViewportSize({ width: 1440, height: 900 });
    const { fixture, finish } = await installFixture(page, baseURL, {
      theme: "light", noViewTransitions: mode === "unsupported", reducedMotion: mode === "reduced",
    });
    const boundaries: Array<{ label: string; shifts: number[] }> = [];
    let historyLength = 0;
    const checkModifiers = async (anchor: Locator) => {
      const originalURL = page.url();
      for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey", "middle"] as const) {
        const prevented = await anchor.evaluate((element, key) => {
          let result: boolean | null = null;
          const inspect = (event: MouseEvent) => { result = event.defaultPrevented; event.preventDefault(); };
          document.addEventListener("click", inspect, { once: true });
          element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true,
            button: key === "middle" ? 1 : 0, ctrlKey: key === "ctrlKey", metaKey: key === "metaKey",
            shiftKey: key === "shiftKey", altKey: key === "altKey" }));
          document.removeEventListener("click", inspect);
          return result;
        }, modifier);
        expect(prevented, `${modifier} leaves the real anchor's browser action intact`).toBe(false);
        await expect(page).toHaveURL(originalURL);
      }
    };
    const collectBoundary = async (label: string) => {
      const shifts = await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe.shifts.slice());
      boundaries.push({ label, shifts });
      if (!baseline) expect(shifts.reduce((sum, value) => sum + value, 0), `${label} has zero layout shift`).toBe(0);
    };
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const landing = page.locator(".sqr-landing-next"), login = landing.locator('a[href="/login"]').first();
      await expect(login).toBeVisible(); await settle(page);
      const supported = await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe.native);
      test.skip(mode === "native" && !baseline && !supported, "This browser lacks native View Transitions; the two fallback modes remain covered");
      historyLength = await page.evaluate(() => history.length);
      await expect(landing).toHaveAttribute("data-theme", "light");
      await landing.getByRole("button", { name: "Toggle color theme", exact: true }).click();
      await expect(landing).toHaveAttribute("data-theme", "dark"); await settle(page);
      if (!baseline) await checkModifiers(login);
      await page.evaluate(() => { (window as unknown as ProbeWindow).__authTransitionProbe.shifts.length = 0; });
      await login.click(); await expect(page).toHaveURL(/\/login$/);
      await expect(page.locator("#auth-v17-title")).toBeVisible();
      await settle(page); await collectBoundary("landing-to-login");
      await expect(page.locator(".auth-v17")).toHaveAttribute("data-theme", "dark");
      expect(await page.evaluate(() => history.length)).toBe(historyLength);
      if (!baseline) {
        await expect(page.locator(".auth-v17-view")).not.toHaveClass(/auth-form-enter/);
        await expect(page.locator(".auth-v17-view")).toHaveCSS("animation-name", "none");
        await expect(page.locator("#auth-v17-title")).toBeFocused();
      }
      await page.locator(".auth-v17-theme").click();
      await expect(page.locator(".auth-v17")).toHaveAttribute("data-theme", "light"); await settle(page);
      const back = page.locator(baseline ? ".auth-v17-topline > .auth-v17-back" : '.auth-v17-topline a[href="/"]');
      if (!baseline) {
        await expect(back).toHaveAttribute("href", "/");
        await checkModifiers(back);
      }
      await page.evaluate(() => { (window as unknown as ProbeWindow).__authTransitionProbe.shifts.length = 0; });
      await back.click();
      await expect(page).toHaveURL(new URL("/", baseURL).href);
      expect(await page.evaluate(() => location.href)).toBe(new URL("/", baseURL).href);
      await expect(landing).toBeVisible(); await settle(page);
      await collectBoundary("login-to-landing");
      await expect(landing).toHaveAttribute("data-theme", "light");
      expect(await page.evaluate(() => history.length)).toBe(historyLength);
      const probe = await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe);
      if (!baseline) {
        await expect(page.locator("html")).not.toHaveAttribute("data-vt");
        expect(probe.animations.filter(animation => animation.name === "auth-in"), "Page arrivals never replay the form's auth entry").toEqual([]);
        if (mode === "native") {
          expect(probe.transitions.map(item => item.kind)).toEqual(["page", "page"]);
          expect(probe.transitions.map(item => item.rootName)).toEqual(["root", "root"]);
          expect(probe.transitions.map(item => [item.slotBefore, item.page?.slotAfter])).toEqual([[null, "none"], ["none", null]]);
          for (const transition of probe.transitions) {
            expect(transition.page).toMatchObject({ oldBlend: "normal", newBlend: "normal", oldAnimation: "none", newAnimation: "auth-page-in" });
          }
          const effects = probe.effects.filter(effect => effect.kind === "page" && effect.name === "auth-page-in");
          expect(effects).toHaveLength(2);
          for (const effect of effects) {
            expect(effect.endTime, "Only the page root fade is subject to the 260ms budget").toBeLessThanOrEqual(260);
            expect(effect.properties).toEqual(["opacity"]);
          }
        } else expect(probe.transitions, "Unsupported/reduced-motion page boundaries are immediate").toEqual([]);
      }
      expect(fixture.state.counts).toEqual({ login: 0, verify: 0, forgot: 0, reset: 0, validate: 0 });
    } finally {
      const probe = await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe).catch(() => null);
      report(testInfo, "landing", { mode, historyLength, boundaries, nativeTimelinePaused: false, probe });
      await finish();
    }
  });
}

test("Auth smooth landing: isolated native forward filmstrip", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(baseline, "Authored native fade evidence is separate from the baseline journey");
  await page.setViewportSize({ width: 1440, height: 900 });
  const { fixture, finish } = await installFixture(page, baseURL, { theme: "dark" });
  const filmstrip: Array<{ timelineMs: number; oldOpacity: string; newOpacity: string }> = [];
  let historyLength = 0;
  let snapshotCancelled = false;
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const landing = page.locator(".sqr-landing-next"), login = landing.locator('a[href="/login"]').first();
    await expect(login).toBeVisible(); await settle(page);
    test.skip(!await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe.native), "Native View Transitions unavailable");
    await expect(landing).toHaveAttribute("data-theme", "dark");
    historyLength = await page.evaluate(() => history.length);
    await page.evaluate(() => {
      (window as unknown as ProbeWindow).__authTransitionProbe.shifts.length = 0;
      const start = document.startViewTransition.bind(document);
      Object.defineProperty(document, "startViewTransition", { configurable: true, value: (update: () => void) => {
        Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
        const transition = start(update);
        (window as unknown as { __authPageFilmstripTransition?: { skipTransition: () => void } }).__authPageFilmstripTransition = transition;
        void transition.ready.then(() => {
          const fade = document.getAnimations().find(animation => (animation as CSSAnimation).animationName === "auth-page-in");
          if (fade) {
            (window as unknown as { __authPageFilmstripAnimation?: Animation }).__authPageFilmstripAnimation = fade;
            fade.pause(); fade.currentTime = 0;
            document.documentElement.dataset.authPageFilmstrip = "ready";
          } else document.documentElement.dataset.authPageFilmstrip = "missing-root-fade";
        }, () => { document.documentElement.dataset.authPageFilmstrip = "snapshot-rejected"; });
        return transition;
      } });
    });
    await login.click();
    await expect(page).toHaveURL(new URL("/login", baseURL).href);
    await expect(page.locator("#auth-v17-title")).toBeVisible();
    await page.waitForFunction(() => document.documentElement.dataset.authPageFilmstrip === "ready");
    for (const timelineMs of [0, 120]) {
      const sample = await page.evaluate(async time => {
        const fade = (window as unknown as { __authPageFilmstripAnimation?: Animation }).__authPageFilmstripAnimation;
        if (!fade) throw new Error("The owned native page fade disappeared before sampling");
        fade.currentTime = time;
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return { timelineMs: time,
          oldOpacity: getComputedStyle(document.documentElement, "::view-transition-old(root)").opacity,
          newOpacity: getComputedStyle(document.documentElement, "::view-transition-new(root)").opacity };
      }, timelineMs);
      filmstrip.push(sample);
      expect(Number(sample.oldOpacity)).toBe(1);
      if (timelineMs === 0) expect(Number(sample.newOpacity)).toBe(0);
      else { expect(Number(sample.newOpacity)).toBeGreaterThan(0); expect(Number(sample.newOpacity)).toBeLessThan(1); }
      await page.screenshot({ path: testInfo.outputPath(timelineMs === 0 ? "auth-page-native-start.jpg" : "auth-page-native-mid.jpg"),
        type: "jpeg", quality: 65, animations: "allow" });
    }
    await page.evaluate(() => {
      const transition = (window as unknown as { __authPageFilmstripTransition?: { skipTransition: () => void } }).__authPageFilmstripTransition;
      if (!transition) throw new Error("The owned native snapshot disappeared before cancellation");
      transition.skipTransition();
    });
    snapshotCancelled = true;
    await expect(page.locator("html")).not.toHaveAttribute("data-vt");
    await settle(page);
    await expect(page).toHaveURL(new URL("/login", baseURL).href);
    expect(await page.evaluate(() => location.href)).toBe(new URL("/login", baseURL).href);
    await expect(page.locator(".auth-v17")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).not.toHaveAttribute("data-vt");
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    const probe = await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe);
    expect(probe.transitions.map(item => item.kind)).toEqual(["page"]);
    expect(probe.transitions[0]?.page).toMatchObject({ slotAfter: "none", oldBlend: "normal", newBlend: "normal",
      oldAnimation: "none", newAnimation: "auth-page-in" });
    expect(probe.shifts.reduce((sum, value) => sum + value, 0)).toBe(0);
    expect(fixture.state.counts).toEqual({ login: 0, verify: 0, forgot: 0, reset: 0, validate: 0 });
  } finally {
    const cleanupCancelled = await page.evaluate(() => {
      const owner = window as unknown as { __authPageFilmstripAnimation?: Animation;
        __authPageFilmstripTransition?: { skipTransition: () => void } };
      const hadTransition = Boolean(owner.__authPageFilmstripTransition);
      owner.__authPageFilmstripTransition?.skipTransition();
      delete owner.__authPageFilmstripAnimation;
      delete owner.__authPageFilmstripTransition;
      return hadTransition;
    }).catch(() => false);
    snapshotCancelled = snapshotCancelled || cleanupCancelled;
    const probe = await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe).catch(() => null);
    // Manual seeking verifies authored opacity states, never wall-clock performance.
    report(testInfo, "page-filmstrip", { historyLength, filmstrip, filmstripUsesPausedNativeTimeline: true,
      authoredTimelineOnly: true, manuallyCancelledSnapshot: snapshotCancelled, naturalCompletionMeasured: false, probe });
    await finish();
  }
});

async function dimensions(control: Locator) {
  const box = await control.boundingBox(); expect(box).toBeTruthy();
  return { width: box!.width, height: box!.height };
}

test("Auth smooth login states: fixed busy button, password toggle and unchanged request/error", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(60_000);
  const { fixture, state, finish } = await installFixture(page, baseURL, { noViewTransitions: true });
  let release: (() => void) | undefined;
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#auth-v17-title")).toBeVisible(); await settle(page);
    if (!baseline) {
      await expect(page.locator("#auth-v17-title")).not.toBeFocused();
      await expect(page.locator("input:focus")).toHaveCount(0);
    }
    await page.getByRole("button", { name: "English", exact: true }).click();
    const username = page.locator("#login-username"), password = page.locator("#login-password");
    await username.fill(authV17FixtureIdentity.username); await password.fill(authV17FixtureIdentity.password);
    const eye = page.getByTestId("button-toggle-password");
    const icons = eye.locator("svg.login-password-toggle__icon");
    const originalIcons = baseline ? [] : await icons.elementHandles();
    if (!baseline) {
      await expect(icons).toHaveCount(2);
      for (const icon of await icons.all()) {
        await expect(icon).toHaveAttribute("aria-hidden", "true");
        await expect(icon).not.toHaveCSS("display", "none");
        await expect(icon).toHaveCSS("transition-property", "opacity");
        await expect(icon).toHaveCSS("transition-duration", "0.12s");
      }
    }
    await eye.click(); await expect(eye).toHaveAttribute("aria-pressed", "true"); await expect(password).toHaveAttribute("type", "text");
    if (!baseline) {
      await expect(eye.locator('svg[data-visible="true"]')).toHaveCSS("opacity", "1");
      await expect(eye.locator('svg[data-visible="false"]')).toHaveCSS("opacity", "0");
    }
    await eye.click(); await expect(eye).toHaveAttribute("aria-pressed", "false"); await expect(password).toHaveAttribute("type", "password");
    if (!baseline) {
      await expect(eye.locator('svg[data-visible="true"]')).toHaveCSS("opacity", "1");
      await expect(eye.locator('svg[data-visible="false"]')).toHaveCSS("opacity", "0");
      expect(await Promise.all(originalIcons.map((icon, index) => icons.nth(index)
        .evaluate((element, previous) => element === previous, icon)))).toEqual([true, true]);
    }
    const submit = page.getByTestId("button-login"), before = await dimensions(submit);
    if (!baseline) await expect(submit.locator(".auth-btn__tail .auth-btn__arrow")).toHaveCount(1);
    fixture.state.loginGate = new Promise<void>(resolve => { release = resolve; });
    await submit.click(); await expect.poll(() => fixture.state.counts.login).toBe(1);
    await expect(submit).toBeDisabled(); await expect(username).toBeDisabled();
    const busy = await dimensions(submit);
    if (!baseline) {
      await expect(submit).toHaveAttribute("aria-busy", "true");
      await expect(submit.locator(".auth-btn__tail .auth-spinner")).toHaveCount(1);
      await expect(submit.locator(".auth-btn__tail .auth-btn__arrow")).toHaveCount(0);
      expect(Math.abs(busy.width - before.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(busy.height - before.height)).toBeLessThanOrEqual(1);
    }
    release?.(); fixture.state.loginGate = null;
    const error = page.locator(baseline ? '.public-auth-status-card--error[role="alert"]' : '.auth-error[role="alert"]');
    await expect(error).toBeVisible(); await expect(submit).toBeEnabled();
    await expect(error).toContainText("Invalid username or password.");
    const after = await dimensions(submit);
    if (!baseline) {
      await expect(error).toHaveAttribute("data-open", "true");
      await expect(error.locator('[role="alert"]')).toHaveCount(0);
      await expect(page.getByRole("alert")).toHaveCount(1);
      await expect(error).toHaveCSS("animation-name", "auth-error-reveal");
      await expect(error).toHaveCSS("animation-duration", "0.2s");
      await expect(submit).not.toHaveAttribute("aria-busy", "true");
      await expect(submit.locator(".auth-spinner")).toHaveCount(0);
      await expect(submit.locator(".auth-btn__tail .auth-btn__arrow")).toHaveCount(1);
      expect(after).toEqual(before);
    }
    expect(state.mutations).toHaveLength(1);
    expect(state.mutations[0].body).toMatchObject({ username: authV17FixtureIdentity.username, password: authV17FixtureIdentity.password });
    expect(Object.keys(state.mutations[0].body).sort()).toEqual(["fingerprint", "password", "username"]);
    expect(typeof state.mutations[0].body.fingerprint).toBe("string");
    const eyeMotion = await icons.evaluateAll(elements => elements.map(element => ({ visible: (element as SVGElement).dataset.visible,
      opacity: getComputedStyle(element).opacity, transition: getComputedStyle(element).transitionProperty,
      duration: getComputedStyle(element).transitionDuration })));
    report(testInfo, "login-state", { before, busy, after, eyeMotion, requestKeys: Object.keys(state.mutations[0].body), error: await error.innerText() });
    for (const icon of originalIcons) await icon.dispose();
  } finally { release?.(); fixture.state.loginGate = null; await finish(); }
});

for (const theme of ["light", "dark"] as const) {
  test(`Auth smooth MFA ${theme}: OTP focus, stable busy button and unchanged verification contract`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(baseline, "Shared-layout MFA verification covers the new implementation");
    const { fixture, state, finish } = await installFixture(page, baseURL, { theme, noViewTransitions: true });
    let release: (() => void) | undefined;
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      fixture.state.login = "mfa";
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#auth-v17-title")).toBeVisible(); await settle(page);
      await page.getByRole("button", { name: "English", exact: true }).click();
      const brand = await page.locator(".auth-v17-brand").elementHandle();
      expect(brand).toBeTruthy();
      const submit = page.getByTestId("button-login");
      await page.locator("#login-username").fill(authV17FixtureIdentity.username);
      await page.locator("#login-password").fill(authV17FixtureIdentity.password);
      await submit.click();
      const otp = page.getByTestId("input-two-factor-code");
      await expect(otp).toBeVisible(); await expect(otp).toBeFocused();
      await expect(otp).toHaveAttribute("inputmode", "numeric");
      await expect(otp).toHaveAttribute("autocomplete", "one-time-code");
      await expect(page.locator(".auth-v17-otp__slot")).toHaveCount(6);
      await expect(submit).toBeDisabled();
      await expect(page.locator("#login-password")).toHaveCount(0);
      await expect(page.locator(".auth-v17")).toHaveAttribute("data-theme", theme);
      await otp.fill("123456"); await expect(submit).toBeEnabled();
      await settle(page);
      const before = await dimensions(submit);
      state.verifyGate = new Promise<void>(resolve => { release = resolve; });
      await submit.click();
      await expect.poll(() => state.mutations.filter(mutation => mutation.path === "/api/auth/verify-two-factor-login").length).toBe(1);
      await expect(submit).toBeDisabled(); await expect(otp).toBeDisabled();
      await expect(submit).toHaveAttribute("aria-busy", "true");
      await expect(submit.locator(".auth-spinner")).toHaveCount(1);
      const busy = await dimensions(submit);
      expect(busy).toEqual(before);
      release?.(); state.verifyGate = null;
      const error = page.locator('.auth-error[role="alert"]');
      await expect(error).toBeVisible(); await expect(error).toHaveAttribute("data-open", "true");
      // The existing feedback mapper intentionally localizes this API code;
      // preserve the displayed copy rather than expecting the raw fixture text.
      await expect(error).toHaveText("The authenticator code is incorrect. Use the latest code and check that your phone's time is set automatically.");
      await expect(page.getByRole("alert")).toHaveCount(1);
      await expect(submit).toBeEnabled(); await expect(otp).toBeEnabled();
      await expect(submit).not.toHaveAttribute("aria-busy", "true");
      await expect(submit.locator(".auth-spinner")).toHaveCount(0);
      expect(await dimensions(submit)).toEqual(before);
      expect(state.mutations).toHaveLength(2);
      expect(state.mutations[0].path).toBe("/api/auth/login");
      expect(state.mutations[0].body).toMatchObject({ username: authV17FixtureIdentity.username, password: authV17FixtureIdentity.password });
      expect(Object.keys(state.mutations[0].body).sort()).toEqual(["fingerprint", "password", "username"]);
      expect(state.mutations[1]).toEqual({ path: "/api/auth/verify-two-factor-login", body: { challengeToken: "v17-ui-challenge", code: "123456" } });
      expect(fixture.state.counts).toEqual({ login: 1, verify: 1, forgot: 0, reset: 0, validate: 0 });
      expect(await brand!.evaluate(element => element.isConnected)).toBe(true);
      await page.locator("button.auth-v17-back").click();
      await expect(page.locator("#login-username")).toBeVisible(); await expect(otp).toHaveCount(0);
      await expect(page).toHaveURL(/\/login$/);
      expect(await brand!.evaluate(element => element.isConnected)).toBe(true);
      await brand?.dispose();
      report(testInfo, "mfa-state", { theme, before, busy, counts: fixture.state.counts,
        verificationBody: state.mutations[1].body, returnedToPassword: true });
    } finally { release?.(); state.verifyGate = null; await finish(); }
  });
}

test("Auth smooth forgot states: same generic success and animation for both identifiers", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(75_000);
  const { fixture, state, finish } = await installFixture(page, baseURL, { noViewTransitions: true });
  let release: (() => void) | undefined;
  try {
    await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#auth-v17-title")).toBeVisible(); await settle(page);
    if (!baseline) {
      await expect(page.locator("#auth-v17-title")).not.toBeFocused();
      await expect(page.locator("input:focus")).toHaveCount(0);
    }
    await page.getByRole("button", { name: "English", exact: true }).click(); await settle(page);
    const identifier = page.locator("#forgot-password-identifier"), submit = page.locator('form button[type="submit"]');
    await identifier.fill(`  ${authV17FixtureIdentity.username}  `);
    const failedBefore = await dimensions(submit);
    state.forgotResult = "temporary";
    state.forgotGate = new Promise<void>(resolve => { release = resolve; });
    await submit.click(); await expect.poll(() => fixture.state.counts.forgot).toBe(1);
    await expect(submit).toBeDisabled(); await expect(identifier).toBeDisabled();
    const failedBusy = await dimensions(submit);
    if (!baseline) {
      await expect(submit).toHaveAttribute("aria-busy", "true");
      await expect(submit.locator(".auth-btn__tail .auth-spinner")).toHaveCount(1);
      expect(failedBusy).toEqual(failedBefore);
    }
    release?.(); state.forgotGate = null;
    const error = page.locator(baseline ? '.public-auth-status-card--error[role="alert"]' : '.auth-error[role="alert"]');
    await expect(error).toContainText("Synthetic temporary recovery failure.");
    await expect(submit).toBeEnabled(); await settle(page);
    const failedAfter = await dimensions(submit);
    if (!baseline) {
      await expect(error.locator('[role="alert"]')).toHaveCount(0);
      await expect(page.getByRole("alert")).toHaveCount(1);
      await expect(submit).not.toHaveAttribute("aria-busy", "true");
      await expect(submit.locator(".auth-spinner")).toHaveCount(0);
      expect(failedAfter).toEqual(failedBefore);
    }
    await expect(identifier).toHaveValue(`  ${authV17FixtureIdentity.username}  `);
    state.forgotResult = "success";
    const results: Array<{ text: string; heading: string; geometry: { x: number; y: number; width: number; height: number }; animation: string; duration: string }> = [];
    for (const value of [authV17FixtureIdentity.username, "missing.fixture@example.invalid"]) {
      await identifier.fill(`  ${value}  `);
      await settle(page);
      const before = await dimensions(submit);
      const entriesBefore = await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe.animations
        .filter(animation => animation.name === "auth-in").length);
      state.forgotGate = new Promise<void>(resolve => { release = resolve; });
      const beforeCount = fixture.state.counts.forgot;
      await submit.click(); await expect.poll(() => fixture.state.counts.forgot).toBe(beforeCount + 1);
      await expect(identifier).toBeDisabled(); await expect(submit).toBeDisabled();
      if (!baseline) {
        await expect(submit).toHaveAttribute("aria-busy", "true");
        expect(await dimensions(submit)).toEqual(before);
      }
      release?.(); state.forgotGate = null;
      const success = page.locator('.public-auth-status-card--success[role="status"]');
      await expect(success).toContainText("If the account exists"); await expect(identifier).toHaveCount(0);
      await settle(page);
      const animation = await success.evaluate(element => {
        const entered = element.closest(".auth-form-enter") ?? element;
        return { name: getComputedStyle(entered).animationName, duration: getComputedStyle(entered).animationDuration };
      });
      if (!baseline) {
        expect(animation).toEqual({ name: "auth-in", duration: "0.26s" });
        expect(await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe.animations
          .filter(entry => entry.name === "auth-in").length)).toBe(entriesBefore + 1);
      }
      const successGeometry = await page.evaluate(() => {
        const heading = document.querySelector("#auth-v17-title")!, box = heading.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      });
      results.push({ text: await success.innerText(), heading: await page.locator("#auth-v17-title").innerText(),
        geometry: successGeometry, animation: animation.name, duration: animation.duration });
      await expect(page.locator("body")).not.toContainText(value);
      if (!baseline) await expect(page.locator("#auth-v17-title")).toBeFocused();
      if (!baseline && value === authV17FixtureIdentity.username) {
        const entries = await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe.animations
          .filter(entry => entry.name === "auth-in").length);
        await page.getByRole("button", { name: "Bahasa Melayu", exact: true }).click();
        await page.getByRole("button", { name: "English", exact: true }).click();
        const theme = page.locator(".auth-v17-theme");
        await theme.click(); await theme.click(); await settle(page);
        expect(await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe.animations
          .filter(entry => entry.name === "auth-in").length)).toBe(entries);
        await expect(theme).toBeFocused();
      }
      await page.getByRole("button", { name: "Use a different username/email", exact: true }).click();
      await expect(identifier).toBeFocused(); await settle(page);
      if (!baseline) {
        await expect(submit).not.toHaveAttribute("aria-busy", "true");
        expect(await dimensions(submit)).toEqual(before);
      }
    }
    expect(results[0]).toEqual(results[1]);
    expect(state.mutations.map(mutation => mutation.body)).toEqual([
      { identifier: authV17FixtureIdentity.username }, { identifier: authV17FixtureIdentity.username }, { identifier: "missing.fixture@example.invalid" },
    ]);
    report(testInfo, "generic-success", { results, requestCount: state.mutations.length, failedBefore, failedBusy, failedAfter });
  } finally { release?.(); state.forgotGate = null; await finish(); }
});

test("Auth smooth helper: recovery disclosure is plain text described by its input", async ({ page, baseURL }) => {
  test.skip(baseline, "Helper presentation is a new Phase 9 requirement");
  const { finish } = await installFixture(page, baseURL, { reducedMotion: true });
  try {
    await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "English", exact: true }).click();
    const identifier = page.locator("#forgot-password-identifier");
    const note = page.getByText("This status does not reveal whether an account exists.", { exact: true });
    await expect(note).toBeVisible();
    const noteId = await note.getAttribute("id"); expect(noteId).toBeTruthy();
    await expect(identifier).toHaveAttribute("aria-describedby", new RegExp(`(?:^|\\s)${noteId}(?:\\s|$)`));
    expect(await note.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    await identifier.focus(); await page.locator("#auth-v17-title").click();
    await expect(identifier).toHaveAttribute("aria-invalid", "true");
    await expect(identifier).toHaveAttribute("aria-describedby", `${noteId} forgot-password-identifier-error`);
    await expect(page.locator("#forgot-password-identifier-error")).toBeVisible();
    await identifier.fill("fixture.private.user");
    await expect(identifier).toHaveAttribute("aria-describedby", noteId!);
    await expect(identifier).not.toHaveAttribute("aria-invalid");
  } finally { await finish(); }
});

test("Auth smooth history: Back cancels a running native snapshot before the fallback", async ({ page, baseURL }) => {
  test.setTimeout(60_000);
  test.skip(baseline, "Regression for the new transition lifecycle");
  const { finish } = await installFixture(page, baseURL);
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#auth-v17-title")).toBeVisible(); await settle(page);
    test.skip(!await page.evaluate(() => typeof document.startViewTransition === "function"), "Native VT unavailable");
    await page.evaluate(() => {
      history.pushState(null, "", "/login");
      const start = document.startViewTransition.bind(document);
      Object.defineProperty(document, "startViewTransition", { configurable: true, value: (update: () => void) => {
        const transition = start(update);
        void transition.ready.then(() => {
          let held = 0;
          for (const animation of document.getAnimations()) {
            if (["auth-in", "auth-out"].includes((animation as CSSAnimation).animationName)) {
              animation.pause(); held++;
            }
          }
          if (held) document.documentElement.dataset.authPaused = "1";
        }, () => undefined);
        return transition;
      } });
    });
    await page.locator('.auth-v17 a[href="/forgot-password"]').evaluate(element => (element as HTMLAnchorElement).click());
    await page.waitForFunction(() => document.documentElement.dataset.authPaused === "1");
    await page.goBack(); await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("html")).not.toHaveAttribute("data-vt");
    await expect(page.locator("#auth-v17-title")).toBeFocused();
    await expect(page.locator(".auth-v17-view")).toHaveClass(/auth-form-enter/);
    await settle(page);
    await expect(page.locator(".auth-v17-view")).toHaveCSS("opacity", "1");
  } finally { await finish(); }
});

test("Auth smooth artwork: delayed original scenes retain decoded artwork through route and theme changes", async ({ page, baseURL, browserName }, testInfo) => {
  test.setTimeout(75_000);
  test.skip(baseline || browserName !== "chromium", "New artwork lifecycle; the network profile uses Chromium CDP");
  await page.setViewportSize({ width: 1440, height: 900 });
  const { fixture, finish } = await installFixture(page, baseURL, { theme: "dark" });
  const session = await page.context().newCDPSession(page);
  const profile = { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8, connectionType: "cellular4g" as const };
  let releaseRecovery!: () => void, releaseLight!: () => void;
  const recoveryGate = new Promise<void>(resolve => { releaseRecovery = resolve; });
  const lightGate = new Promise<void>(resolve => { releaseLight = resolve; });
  const requests = { darkRecovery: 0, lightSignin: 0, lightRecovery: 0 };
  const pending = new Set<Promise<void>>();
  const artPattern = /\/(?:assets\/sqr-illustration[^/]*|illustrations\/reset-password-(?:light|dark))\.webp(?:\?.*)?$/;
  const intercept = (route: Route) => {
    const work = (async () => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(baseURL!).origin) return route.fallback();
      if (url.pathname.endsWith("/reset-password-dark.webp")) {
        requests.darkRecovery++; await recoveryGate;
      } else if (url.pathname.endsWith("/reset-password-light.webp")) {
        requests.lightRecovery++; await lightGate;
      } else if (/\/sqr-illustration(?:-[^/]+)?\.webp$/.test(url.pathname)
        && !url.pathname.includes("/sqr-illustration-dark")) {
        requests.lightSignin++; await lightGate;
      }
      return route.fallback();
    })().finally(() => pending.delete(work));
    pending.add(work); return work;
  };
  const art = page.locator(".auth-brand-artwork"), signin = art.locator(".auth-v17-signin-illustration");
  const recovery = art.locator(".auth-v17-recovery-illustration");
  const snapshot = () => art.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { frame: { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height },
      images: Array.from(element.querySelectorAll("img"), image => ({ src: image.getAttribute("src"),
        complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        width: image.getAttribute("width"), height: image.getAttribute("height"),
        active: image.dataset.active, opacity: getComputedStyle(image).opacity,
        transition: getComputedStyle(image).transitionProperty, duration: getComputedStyle(image).transitionDuration })) };
  });
  const expectFrame = (actual: Awaited<ReturnType<typeof snapshot>>, expected: Awaited<ReturnType<typeof snapshot>>) => {
    for (const dimension of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(actual.frame[dimension] - expected.frame[dimension]), `Artwork frame/${dimension}`).toBeLessThanOrEqual(1);
    }
  };
  let registered = false;
  try {
    await session.send("Network.enable");
    await session.send("Network.emulateNetworkConditions", profile);
    await page.context().route(artPattern, intercept); registered = true;
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#auth-v17-title")).toBeVisible();
    await expect(art).toBeVisible();
    await expect.poll(() => requests.darkRecovery).toBeGreaterThan(0);
    await expect(signin).toHaveAttribute("data-active", "true");
    await expect(signin).toHaveCSS("opacity", "1"); await settle(page);
    const images = await art.locator("img").elementHandles();
    expect(images).toHaveLength(2);
    const original = await snapshot();
    expect(original.frame.width).toBeGreaterThan(0);
    expect(original.frame.height).toBeGreaterThan(0);
    expect(original.images[0].src).toMatch(/\/sqr-illustration-dark(?:-[\w-]+)?\.webp$/);
    expect(original.images[0]).toMatchObject({ complete: true, naturalWidth: 1359, naturalHeight: 1157,
      width: "1359", height: "1157" });
    expect(original.images[1]).toMatchObject({ src: "/illustrations/reset-password-dark.webp", active: "false" });
    await page.evaluate(() => { (window as unknown as ProbeWindow).__authTransitionProbe.shifts.length = 0; });
    await navigateAuth(page, "forgot-password");
    const recoveryPending = await snapshot();
    expectFrame(recoveryPending, original);
    expect(recoveryPending.images[0]).toMatchObject({ src: original.images[0].src, active: "true", opacity: "1" });
    expect(recoveryPending.images[1].complete && recoveryPending.images[1].naturalWidth > 0).toBe(false);
    await page.screenshot({ path: testInfo.outputPath("auth-artwork-pending-dark.jpg"), type: "jpeg", quality: 65, animations: "disabled" });
    await recovery.evaluate(element => {
      const image = element as HTMLImageElement;
      const observe = (event: TransitionEvent) => {
        if (event.propertyName !== "opacity") return;
        const fade = image.getAnimations().find(animation => animation instanceof CSSTransition
          && animation.transitionProperty === "opacity");
        if (fade?.effect) {
          image.dataset.authFade = `opacity:${fade.playState}:${fade.effect.getTiming().duration}`;
          requestAnimationFrame(() => { image.dataset.authFadeOpacity = getComputedStyle(image).opacity; });
        }
        image.removeEventListener("transitionrun", observe);
      };
      image.addEventListener("transitionrun", observe);
    });
    releaseRecovery();
    await expect(recovery).toHaveAttribute("data-active", "true");
    await expect(recovery).toHaveAttribute("data-auth-fade", "opacity:running:360");
    await art.locator("img").evaluateAll(async elements => {
      await Promise.all(elements.map(element => (element as HTMLImageElement).decode()));
    });
    await settle(page);
    const readyDark = await snapshot();
    expectFrame(readyDark, original);
    expect(await Promise.all(images.map((image, index) => art.locator("img").nth(index)
      .evaluate((element, previous) => element === previous, image)))).toEqual([true, true]);
    expect(readyDark.images[1]).toMatchObject({ complete: true, naturalWidth: 640, naturalHeight: 640,
      width: "640", height: "640", active: "true", opacity: "1" });
    expect(readyDark.images[0]).toMatchObject({ active: "false", opacity: "0" });
    expect(readyDark.images[1].transition).toBe("opacity, transform");
    expect(readyDark.images[1].duration).toBe("0.36s, 0.36s");
    await page.screenshot({ path: testInfo.outputPath("auth-artwork-ready-dark.jpg"), type: "jpeg", quality: 65, animations: "disabled" });

    // Hold only the next form snapshots. Artwork remains in ordinary DOM and
    // runs its real transition while the persistent toolbar is exercised.
    const heldNative = await page.evaluate(() => {
      const start = document.startViewTransition?.bind(document);
      if (!start) return false;
      Object.defineProperty(document, "startViewTransition", { configurable: true, value: (update: () => void) => {
        Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
        const transition = start(update);
        void transition.ready.then(() => {
          let held = 0;
          for (const animation of document.getAnimations()) {
            if (["auth-in", "auth-out"].includes((animation as CSSAnimation).animationName)) { animation.pause(); held++; }
          }
          document.documentElement.dataset.artworkHeld = String(held);
        }, () => undefined);
        return transition;
      } });
      return true;
    });
    await page.locator('.auth-v17 a[href="/login"]').evaluate(element => (element as HTMLAnchorElement).click());
    await expect(page).toHaveURL(/\/login$/);
    if (heldNative) {
      await page.waitForFunction(() => Number(document.documentElement.dataset.artworkHeld) > 0);
      await expect(page.locator("html")).toHaveAttribute("data-vt", "auth");
    }
    await expect(signin).toHaveAttribute("data-active", "true");
    await expect(signin).toHaveCSS("opacity", "1");
    await page.locator(".auth-v17-theme").click();
    await expect(page.locator(".auth-v17")).toHaveAttribute("data-theme", "light");
    if (heldNative) await expect(page.locator("html")).toHaveAttribute("data-vt", "auth");
    await expect.poll(() => requests.lightSignin > 0 && requests.lightRecovery > 0).toBe(true);
    const themePending = await snapshot();
    expectFrame(themePending, original);
    expect(themePending.images[0]).toMatchObject({ src: original.images[0].src, active: "true", opacity: "1" });
    expect(themePending.images[1].src).toBe("/illustrations/reset-password-dark.webp");
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        if (animation.playState === "paused" && ["auth-in", "auth-out"].includes((animation as CSSAnimation).animationName)) animation.play();
      }
    });
    releaseLight();
    await expect(signin).not.toHaveAttribute("src", original.images[0].src!);
    await expect(recovery).toHaveAttribute("src", "/illustrations/reset-password-light.webp");
    await art.locator("img").evaluateAll(async elements => {
      await Promise.all(elements.map(element => (element as HTMLImageElement).decode()));
    });
    await settle(page);
    const readyLight = await snapshot();
    expectFrame(readyLight, original);
    expect(readyLight.images[0].src).toMatch(/\/sqr-illustration(?:-[\w-]+)?\.webp$/);
    expect(readyLight.images[0].src).not.toContain("sqr-illustration-dark");
    expect(readyLight.images[0]).toMatchObject({ complete: true, naturalWidth: 1780, naturalHeight: 1516,
      width: "1780", height: "1516", active: "true", opacity: "1" });
    expect(readyLight.images[1]).toMatchObject({ complete: true, naturalWidth: 640, naturalHeight: 640, width: "640", height: "640" });
    expect(await Promise.all(images.map((image, index) => art.locator("img").nth(index)
      .evaluate((element, previous) => element === previous, image)))).toEqual([true, true]);
    const shifts = await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe.shifts);
    expect(shifts.reduce((sum, value) => sum + value, 0)).toBe(0);
    expect(fixture.state.counts).toEqual({ login: 0, verify: 0, forgot: 0, reset: 0, validate: 0 });
    await page.screenshot({ path: testInfo.outputPath("auth-artwork-ready-light.jpg"), type: "jpeg", quality: 65, animations: "disabled" });
    const recoveryFade = await recovery.evaluate(element => ({ state: (element as HTMLElement).dataset.authFade,
      sampledOpacity: (element as HTMLElement).dataset.authFadeOpacity }));
    report(testInfo, "latency-gated-artwork", { profile, requests, original, recoveryPending, readyDark, themePending, readyLight, shifts, heldNative, recoveryFade });
    for (const image of images) await image.dispose();
  } finally {
    releaseRecovery(); releaseLight();
    await session.send("Network.emulateNetworkConditions", { offline: false, latency: 0,
      downloadThroughput: -1, uploadThroughput: -1 }).catch(() => undefined);
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        if (animation.playState === "paused" && ["auth-in", "auth-out"].includes((animation as CSSAnimation).animationName)) animation.play();
      }
    }).catch(() => undefined);
    while (pending.size) await Promise.all(pending);
    if (registered) await page.context().unroute(artPattern, intercept);
    await session.detach();
    await finish();
  }
});

for (const failDark of [false, true]) {
test(`Auth smooth artwork retry: explicit theme revisit after ${failDark ? "both palettes fail before frame replacement" : "a failed light scene and decoded dark scene"}`, async ({ page, baseURL }, testInfo) => {
  test.setTimeout(45_000);
  test.skip(baseline, "Regression for failed-asset retry after a later theme visit");
  await page.setViewportSize({ width: 1440, height: 900 });
  const { fixture, finish } = await installFixture(page, baseURL, { theme: "light" });
  const expectedOrigin = new URL(baseURL!).origin;
  const pending = new Set<Promise<void>>();
  const responses: Array<{ palette: Theme; attempt: number; src: string; syntheticFailure: boolean }> = [];
  const attempts = { light: 0, dark: 0 };
  let allowLightSuccess = false, initialAttempts = 0, beforeRetry = 0;
  let originalLight: string | null = null, stage = "initial-light";
  const pattern = /\/assets\/sqr-illustration(?:-[^/]+)?\.webp(?:\?.*)?$/;
  const intercept = (route: Route) => {
    const work = (async () => {
      const url = new URL(route.request().url());
      if (url.origin !== expectedOrigin) return route.fallback();
      const palette: Theme = url.pathname.includes("/sqr-illustration-dark") ? "dark" : "light";
      const attempt = ++attempts[palette];
      // Boot resource hints and the DOM image may each request the same URL.
      // Keep every initial light response invalid until the explicit revisit.
      const syntheticFailure = palette === "light" ? !allowLightSuccess : failDark;
      responses.push({ palette, attempt, src: url.pathname, syntheticFailure });
      if (syntheticFailure) {
        // A successful HTTP response with undecodable bytes exercises the image
        // error path without adding an expected network/console error exception.
        return route.fulfill({ status: 200, contentType: "image/webp", headers: { "cache-control": "no-store" },
          body: Buffer.from("synthetic undecodable artwork") });
      }
      const response = await route.fetch({ maxRedirects: 0 });
      expect(new URL(response.url()).origin).toBe(expectedOrigin);
      expect(response.status()).toBe(200);
      return route.fulfill({ response });
    })().finally(() => pending.delete(work));
    pending.add(work); return work;
  };
  try {
    await page.context().route(pattern, intercept);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#auth-v17-title")).toBeVisible();
    const signin = page.locator(".auth-brand-artwork .auth-v17-signin-illustration");
    const originalImage = await signin.elementHandle();
    originalLight = await signin.getAttribute("src");
    expect(originalLight).toMatch(/\/sqr-illustration(?:-[\w-]+)?\.webp$/);
    expect(originalLight).not.toContain("sqr-illustration-dark");
    await expect.poll(() => signin.evaluate(element => ({ complete: (element as HTMLImageElement).complete,
      width: (element as HTMLImageElement).naturalWidth }))).toEqual({ complete: true, width: 0 });
    await settle(page);
    initialAttempts = attempts.light;
    expect(initialAttempts).toBeGreaterThan(0);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(attempts.light, "The failed image does not cause an automatic retry loop across settled frames").toBe(initialAttempts);

    stage = "dark-visit";
    await page.locator(".auth-v17-theme").click();
    await expect(page.locator(".auth-v17")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => attempts.dark).toBeGreaterThan(0);
    if (failDark) {
      await expect.poll(() => pending.size).toBe(0); await settle(page);
      // Failed/cancelled offscreen replacement leaves the failed light source
      // on this same DOM node. Returning to that URL must still retry it.
      const darkAttempts = attempts.dark;
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(attempts.dark, "The failed dark scene also avoids an automatic retry loop across settled frames").toBe(darkAttempts);
      await expect(signin).toHaveAttribute("src", originalLight!);
      expect(await signin.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(0);
    } else {
      await expect(signin).toHaveAttribute("src", /\/sqr-illustration-dark(?:-[\w-]+)?\.webp$/);
      await expect(signin).toHaveAttribute("data-active", "true");
      await expect(signin).toHaveCSS("opacity", "1");
      await signin.evaluate(element => (element as HTMLImageElement).decode());
    }

    stage = "light-revisit";
    beforeRetry = attempts.light;
    allowLightSuccess = true;
    await page.locator(".auth-v17-theme").click();
    await expect(page.locator(".auth-v17")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => attempts.light, { message: "A later explicit theme visit retries the failed original asset" }).toBeGreaterThan(beforeRetry);
    await expect(signin).toHaveAttribute("src", originalLight!);
    await signin.evaluate(element => (element as HTMLImageElement).decode());
    await expect(signin).toHaveAttribute("data-active", "true");
    await expect(signin).toHaveCSS("opacity", "1");
    expect(await signin.evaluate(element => ({ width: (element as HTMLImageElement).naturalWidth,
      height: (element as HTMLImageElement).naturalHeight }))).toEqual({ width: 1780, height: 1516 });
    expect(attempts.light).toBeGreaterThan(beforeRetry);
    expect(await signin.evaluate((element, previous) => element === previous, originalImage)).toBe(true);
    expect(fixture.state.counts).toEqual({ login: 0, verify: 0, forgot: 0, reset: 0, validate: 0 });
    stage = "passed";
    await originalImage?.dispose();
  } finally {
    report(testInfo, "failed-artwork-explicit-retry", { failDark, stage, responses, originalLight,
      initialAttempts, beforeRetry, attempts, allowLightSuccess });
    while (pending.size) await Promise.all(pending);
    await page.context().unroute(pattern, intercept);
    await finish();
  }
});
}

for (const profile of [
  { mode: "high", cpu: 1 }, { mode: "auto", cpu: 4 }, { mode: "low", cpu: 6 },
] as const) {
  test(`Auth smooth performance: CPU ${profile.cpu}x with ${profile.mode} mode preserves keyboard and scoped motion`, async ({ page, baseURL, browserName }, testInfo) => {
    test.setTimeout(45_000);
    test.skip(baseline || browserName !== "chromium", "Measures the new native lifecycle using Chromium CPU emulation");
    await page.setViewportSize({ width: 1440, height: 900 });
    const { fixture, finish } = await installFixture(page, baseURL, { performanceMode: profile.mode, performanceProbe: true });
    const session = await page.context().newCDPSession(page);
    const focus: Array<{ outline: string; outlineWidth: string; boxShadow: string; focusVisible: boolean }> = [];
    let journeyStart = 0, cpuEmulationAccepted = false;
    let modeEvidence: { override: string | null; lowSpec: boolean; reducedMotion: boolean;
      cores: number; deviceMemory: number | null; saveData: boolean | null } | null = null;
    const expectDocumentPath = async (pathname: string) => {
      await expect.poll(() => page.evaluate(() => new URL(document.documentURI).pathname),
        { message: `The live document, independently of cached frame metadata, navigates to ${pathname}` }).toBe(pathname);
    };
    try {
      await session.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu }); cpuEmulationAccepted = true;
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#auth-v17-title")).toBeVisible();
      await page.getByRole("button", { name: "English", exact: true }).click();
      await page.locator(".auth-brand-artwork img").evaluateAll(async elements => {
        await Promise.all(elements.map(element => (element as HTMLImageElement).decode()));
      });
      await expect(page.locator('.auth-v17-signin-illustration[data-active="true"]')).toHaveCSS("opacity", "1");
      await settle(page);
      modeEvidence = await page.evaluate(() => ({ override: localStorage.getItem("perf_mode"),
        lowSpec: document.documentElement.classList.contains("low-spec"),
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, cores: navigator.hardwareConcurrency,
        deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
        saveData: (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ?? null }));
      expect(modeEvidence.override).toBe(profile.mode === "auto" ? null : profile.mode);
      if (profile.mode !== "auto") expect(modeEvidence.lowSpec).toBe(profile.mode === "low");
      expect(modeEvidence.reducedMotion).toBe(false);
      expect(await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe.native)).toBe(true);
      journeyStart = await page.evaluate(() => {
        const probe = (window as unknown as ProbeWindow).__authTransitionProbe;
        probe.transitions.length = 0; probe.effects.length = 0; probe.motion.length = 0;
        probe.animations.length = 0; probe.shifts.length = 0;
        return performance.now();
      });

      // Trigger the existing composited hover/eye feedback without submitting
      // credentials, then complete the auth and page journeys using a keyboard.
      await page.getByTestId("button-login").hover(); await page.mouse.move(0, 0); await settle(page);
      const eye = page.getByTestId("button-toggle-password");
      await eye.focus(); await eye.press("Space"); await expect(eye).toHaveAttribute("aria-pressed", "true"); await settle(page);
      await eye.press("Space"); await expect(eye).toHaveAttribute("aria-pressed", "false"); await settle(page);
      const forgot = page.locator('.login-secondary-link[href="/forgot-password"]');
      await forgot.focus(); await expect(forgot).toBeFocused(); await forgot.press("Enter");
      await expectDocumentPath("/forgot-password"); await settle(page);
      const heading = page.locator("#auth-v17-title");
      await expect(heading).toBeFocused(); await expect(heading).toHaveAttribute("tabindex", "-1");
      await expect(heading).toHaveRole("heading");
      await page.keyboard.press("Tab");
      const identifier = page.locator("#forgot-password-identifier");
      await expect(identifier).toBeFocused();
      const indicator = await identifier.evaluate(element => ({ outline: getComputedStyle(element).outlineStyle,
        outlineWidth: getComputedStyle(element).outlineWidth, boxShadow: getComputedStyle(element).boxShadow,
        focusVisible: element.matches(":focus-visible") }));
      focus.push(indicator);
      expect(indicator.focusVisible).toBe(true);
      expect((indicator.outline !== "none" && Number.parseFloat(indicator.outlineWidth) > 0)
        || indicator.boxShadow !== "none", "Keyboard focus has an authored visible ring").toBe(true);
      await page.keyboard.press("Tab");
      await expect(page.locator('form button[type="submit"]')).toBeFocused();
      await page.keyboard.press("Tab");
      const back = page.locator('.auth-v17-persistent-actions a[href="/login"]');
      await expect(back).toBeFocused(); await back.press("Enter");
      await expectDocumentPath("/login"); await expect(heading).toBeFocused(); await settle(page);
      const home = page.locator('.auth-v17-topline a[href="/"]');
      await home.focus(); await home.press("Enter");
      await expectDocumentPath("/"); await expect(page.locator(".sqr-landing-next")).toBeVisible(); await settle(page);
      const login = page.locator('.sqr-landing-next a[href="/login"]').first();
      await login.focus(); await login.press("Enter");
      await expectDocumentPath("/login"); await expect(heading).toBeFocused();
      await page.locator(".auth-brand-artwork img").evaluateAll(async elements => {
        await Promise.all(elements.map(element => (element as HTMLImageElement).decode()));
      });
      await expect(page.locator('.auth-v17-signin-illustration[data-active="true"]')).toHaveCSS("opacity", "1");
      await settle(page);

      const probe = await page.evaluate(() => (window as unknown as ProbeWindow).__authTransitionProbe);
      expect(probe.transitions.map(transition => transition.kind)).toEqual(["auth", "auth", "page", "page"]);
      expect(probe.transitions.every(transition => transition.finished !== undefined)).toBe(true);
      expect(probe.effects.length).toBeGreaterThanOrEqual(6);
      for (const effect of probe.effects) {
        expect(effect.properties.every(property => ["opacity", "transform"].includes(property))).toBe(true);
        expect(effect.endTime).toBeLessThanOrEqual(effect.kind === "page" ? 260 : 400);
      }
      expect(probe.motionDropped, "Every observed scoped effect fits the bounded audit buffer").toBe(0);
      expect(probe.motion.some(motion => motion.source === "animation")).toBe(true);
      expect(probe.motion.some(motion => motion.source === "transition" && motion.name === "opacity"
        && motion.targetClass.includes("login-password-toggle__icon") && motion.duration === 120)).toBe(true);
      expect(probe.motion.some(motion => motion.source === "transition" && motion.name === "opacity"
        && motion.targetClass.includes("auth-v17-recovery-illustration") && motion.duration === 360),
      "Functional illustration motion remains available in every performance mode").toBe(true);
      for (const motion of probe.motion) {
        const allowed = motion.errorReveal ? ["opacity", "transform", "gridTemplateRows"] : ["opacity", "transform"];
        expect(motion.properties.every(property => allowed.includes(property)), `${motion.source}/${motion.name} uses only permitted properties`).toBe(true);
        expect(motion.duration, `${motion.name} has a measurable authored duration`).not.toBeNull();
        if (motion.name === "auth-spin") expect(motion.duration).toBe(700);
        else expect(motion.duration!).toBeLessThanOrEqual(motion.source === "transition" ? 360 : 400);
      }
      expect(fixture.state.counts).toEqual({ login: 0, verify: 0, forgot: 0, reset: 0, validate: 0 });
    } finally {
      const measured = await page.evaluate(() => {
        const target = window as unknown as ProbeWindow; target.__flushAuthPerformance?.();
        return { probe: target.__authTransitionProbe, now: performance.now(), documentURI: document.documentURI,
          apiWall: performance.getEntriesByType("resource").filter(entry => new URL(entry.name).pathname.startsWith("/api/"))
            .slice(-32).map(entry => ({ path: new URL(entry.name).pathname, started: entry.startTime, wall: entry.duration })) };
      }).catch(() => null);
      if (measured) {
        const windows = measured.probe.transitions.map(transition => {
          const completed = transition.finished ?? transition.started;
          const related = measured.probe.motion.filter(motion => motion.at >= transition.started && motion.at <= completed);
          const end = Math.max(completed, ...related.map(motion => motion.finished ?? completed));
          return { kind: transition.kind, started: transition.started, readyAt: transition.readyAt ?? null,
            nativeFinished: transition.finished ?? null, nativeWall: transition.finished === undefined ? null : transition.finished - transition.started,
            scopedMotionFinished: end, scopedWall: end - transition.started,
            overlappingLongTasks: measured.probe.longTasks.filter(task => task.start < end && task.start + task.duration > transition.started) };
        });
        const violations = windows.flatMap((window, index) => window.overlappingLongTasks.filter(task => task.duration > 50)
          .map(task => ({ window: index, kind: window.kind, ...task })));
        const unfinishedMotion = measured.probe.motion.filter(motion => motion.iterations !== "infinite" && motion.finished === undefined);
        const captureComplete = measured.probe.longTasksSupported && measured.probe.longTasksDropped === 0
          && measured.probe.motionDropped === 0 && unfinishedMotion.length === 0
          && journeyStart > 0 && windows.length === 4 && windows.every(window => window.nativeFinished !== null);
        const longTaskAcceptance = !captureComplete ? "INCOMPLETE" : violations.length ? "FAIL" : "PASS";
        // This is an audit result, separate from deterministic behavior checks.
        // A FAIL remains a Phase 10 finding; it must not be reported as passed.
        console.log(`AUTH_LONG_TASK_ACCEPTANCE=${longTaskAcceptance} CPU=${profile.cpu} MODE=${profile.mode}`);
        report(testInfo, "performance-audit", { profile, cpuEmulationAccepted, modeEvidence, journeyStart,
          journeyEnd: measured.now, actualDocumentURI: measured.documentURI, focus, windows, violations, longTaskAcceptance,
          longTasksSupported: measured.probe.longTasksSupported, longTasksDropped: measured.probe.longTasksDropped,
          motion: measured.probe.motion, motionDropped: measured.probe.motionDropped, unfinishedMotion,
          interactionLongTasks: measured.probe.longTasks.filter(task => task.start < measured.now && task.start + task.duration > journeyStart),
          apiWall: measured.apiWall, apiTimingScope: "synthetic loopback resource wall time; not production API latency",
          hardwareScope: "CDP CPU emulation in the bounded runner; auto mode records its actual detected class",
          gpuCompositionVerified: false, gpuScope: "animated-property policy checked; GPU layer assignment not traced" });
      } else console.log(`AUTH_LONG_TASK_ACCEPTANCE=INCOMPLETE CPU=${profile.cpu} MODE=${profile.mode}`);
      await session.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => undefined);
      await session.detach().catch(() => undefined);
      await finish();
    }
  });
}

test("Auth smooth touch: the password toggle has no sticky hover surface", async ({ browser, browserName, baseURL }) => {
  test.setTimeout(45_000);
  test.skip(baseline || browserName !== "chromium", "A fresh Chromium mobile/touch context verifies hover:none");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    const { fixture, finish } = await installFixture(page, baseURL);
    try {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      const eye = page.getByTestId("button-toggle-password");
      await expect(eye).toBeVisible(); await settle(page);
      expect(await page.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(false);
      const before = await eye.evaluate(element => getComputedStyle(element).backgroundColor);
      await eye.tap(); await expect(eye).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("#login-password")).toHaveAttribute("type", "text"); await settle(page);
      expect(await eye.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(before);
      await eye.tap(); await expect(eye).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator("#login-password")).toHaveAttribute("type", "password"); await settle(page);
      expect(await eye.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(before);
      expect(fixture.state.counts).toEqual({ login: 0, verify: 0, forgot: 0, reset: 0, validate: 0 });
    } finally { await finish(); }
  } finally { await context.close(); }
});

type SampledCpuNode = { id: number; children?: number[];
  callFrame: { functionName: string; url: string; scriptId: string; lineNumber: number; columnNumber: number } };
function summarizeSampledCpu(profile: { nodes: SampledCpuNode[]; samples?: number[]; timeDeltas?: number[];
  startTime: number; endTime: number }, origin: string) {
  const nodes = new Map(profile.nodes.slice(0, 50_000).map(node => [node.id, node]));
  const parents = new Map<number, number>();
  for (const node of nodes.values()) for (const child of node.children ?? []) if (!parents.has(child)) parents.set(child, node.id);
  const describe = (node: SampledCpuNode) => {
    const raw = node.callFrame, name = (raw.functionName || "(anonymous)").slice(0, 120);
    const url = (raw.url.startsWith(origin) ? raw.url.slice(origin.length).split(/[?#]/, 1)[0] : raw.url).slice(0, 200);
    const category = name === "(idle)" ? "idle" : name === "(garbage collector)" ? "GC"
      : ["(program)", "(root)"].includes(name) ? "program"
        : raw.url.startsWith(`${origin}/assets/`) ? "app-assets"
          : /playwright|utilityscript|injectedscript|__pw|eval/i.test(raw.url)
            || (!raw.url && /^(recordMotion|consume|evaluate|initializeBrowserThemeFixture)$/.test(name)) ? "injected-test"
            : raw.url.startsWith(origin) ? "app-other" : "native-or-unattributed";
    return { name, url, scriptId: raw.scriptId.slice(0, 24), line: raw.lineNumber >= 0 ? raw.lineNumber + 1 : null,
      column: raw.columnNumber >= 0 ? raw.columnNumber + 1 : null, category };
  };
  type Row = ReturnType<typeof describe> & { samples: number; selfUs: number; callers: Array<{ name: string; url: string; line: number | null }> };
  const rows = new Map<string, Row>();
  const samples = profile.samples ?? [], deltas = profile.timeDeltas ?? [];
  const count = Math.min(samples.length, deltas.length, 100_000);
  let sampledUs = 0, maxDeltaUs = 0, deltasOver20ms = 0, missingNodes = 0;
  for (let index = 0; index < count; index++) {
    const delta = Math.max(0, deltas[index]);
    sampledUs += delta; maxDeltaUs = Math.max(maxDeltaUs, delta); if (delta > 20_000) deltasOver20ms++;
    const node = nodes.get(samples[index]);
    if (!node) { missingNodes++; continue; }
    const frame = describe(node), key = JSON.stringify(frame);
    let row = rows.get(key);
    if (!row) {
      const callers: Row["callers"] = [];
      let parent = parents.get(node.id);
      for (let depth = 0; parent !== undefined && depth < 2; depth++) {
        const candidate = nodes.get(parent); if (!candidate) break;
        const caller = describe(candidate); callers.push({ name: caller.name.slice(0, 80), url: caller.url.slice(0, 160), line: caller.line });
        parent = parents.get(parent);
      }
      row = { ...frame, samples: 0, selfUs: 0, callers }; rows.set(key, row);
    }
    row.samples++; row.selfUs += delta;
  }
  const totals = new Map<string, { samples: number; selfUs: number }>();
  for (const row of rows.values()) {
    const total = totals.get(row.category) ?? { samples: 0, selfUs: 0 };
    total.samples += row.samples; total.selfUs += row.selfUs; totals.set(row.category, total);
  }
  return { samplingIntervalUs: 2000, profileWallMs: (profile.endTime - profile.startTime) / 1000,
    sampledWallMs: sampledUs / 1000, maxDeltaMs: maxDeltaUs / 1000, deltasOver20ms, sampleCount: samples.length,
    processedSamples: count, nodeCount: profile.nodes.length, missingNodes,
    captureComplete: samples.length === deltas.length && count === samples.length && profile.nodes.length <= 50_000 && missingNodes === 0,
    categories: Array.from(totals, ([category, total]) => ({ category, samples: total.samples, sampledSelfMs: total.selfUs / 1000 })),
    topFunctions: Array.from(rows.values()).sort((first, second) => second.selfUs - first.selfUs).slice(0, 25)
      .map(({ selfUs, ...row }) => ({ ...row, sampledSelfMs: selfUs / 1000 })),
    timingScope: "Statistical wall-delta attribution, not exclusive CPU time; cgroup off-CPU/reclaim gaps may inflate samples",
    callerScope: "At most two representative caller frames; unlabeled native/eval samples remain unattributed",
    rawProfileArtifactWritten: false };
}

test.describe("Bounded auth attribution diagnostics", () => {
  // The bounded audit configuration disables trace/video/screenshots; these
  // worker-scoped options cannot be changed from a describe group.
  for (const mode of ["native", "unsupported"] as const) {
    test(`Auth smooth attribution: ${mode}`, async ({ page, baseURL, browserName }) => {
      test.setTimeout(70_000);
      test.skip(baseline || browserName !== "chromium", "Diagnostic comparison uses the new flow and Chromium's sampled profiler");
      await page.setViewportSize({ width: 1440, height: 900 });
      const { fixture, finish } = await installFixture(page, baseURL, { performanceMode: "high", performanceProbe: true,
        attributionProbe: true, noViewTransitions: mode === "unsupported" });
      const session = await page.context().newCDPSession(page);
      const metricNames = ["Timestamp", "ProcessTime", "ThreadTime", "TaskDuration", "ScriptDuration", "LayoutDuration",
        "RecalcStyleDuration", "LayoutCount", "RecalcStyleCount", "JSHeapUsedSize", "JSHeapTotalSize", "Nodes", "Documents", "Frames", "JSEventListeners"];
      const metrics = async () => {
        const response = await session.send("Performance.getMetrics");
        return Object.fromEntries(response.metrics.filter(metric => metricNames.includes(metric.name)).map(metric => [metric.name, metric.value]));
      };
      const documentState = () => page.evaluate(() => ({ now: performance.now(), uri: document.documentURI,
        timeOrigin: performance.timeOrigin, scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth, viewport: { width: innerWidth, height: innerHeight } }));
      let running = false, actionStartedAt = 0;
      let before: Record<string, number> | null = null, after: Record<string, number> | null = null;
      let cpu: ReturnType<typeof summarizeSampledCpu> | null = null;
      let priorDocument: Awaited<ReturnType<typeof documentState>> | null = null;
      let settledDocument: Awaited<ReturnType<typeof documentState>> | null = null;
      let profilerError: string | null = null;
      try {
        await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        await session.send("Performance.enable"); await session.send("Profiler.enable");
        await session.send("Profiler.setSamplingInterval", { interval: 2000 });
        await page.goto("/login", { waitUntil: "domcontentloaded" });
        await expect(page.locator("#auth-v17-title")).toBeVisible();
        await page.locator(".auth-brand-artwork img").evaluateAll(async elements => {
          await Promise.all(elements.map(element => (element as HTMLImageElement).decode()));
        });
        await expect(page.locator('.auth-v17-signin-illustration[data-active="true"]')).toHaveCSS("opacity", "1");
        await settle(page);
        const home = page.locator('.auth-v17-topline a[href="/"]'); await home.focus();
        await page.evaluate(() => {
          const probe = (window as unknown as ProbeWindow).__authTransitionProbe;
          probe.transitions.length = 0; probe.effects.length = 0; probe.motion.length = 0;
        });
        priorDocument = await documentState(); before = await metrics();
        await session.send("Profiler.start"); running = true;
        actionStartedAt = await page.evaluate(() => performance.now());
        await home.press("Enter");
        await expect.poll(() => page.evaluate(() => new URL(document.documentURI).pathname)).toBe("/");
        await expect(page.locator(".sqr-landing-next")).toBeVisible(); await settle(page);
        settledDocument = await documentState();
        const stopped = await session.send("Profiler.stop"); running = false;
        after = await metrics();
        cpu = summarizeSampledCpu(stopped.profile, new URL(baseURL!).origin);
        expect(fixture.state.counts).toEqual({ login: 0, verify: 0, forgot: 0, reset: 0, validate: 0 });
      } finally {
        if (running) {
          try {
            const stopped = await session.send("Profiler.stop"); running = false;
            cpu = summarizeSampledCpu(stopped.profile, new URL(baseURL!).origin);
          } catch (error) { profilerError = String(error).slice(0, 200); }
        }
        if (!after) after = await metrics().catch(() => null);
        const currentDocument = settledDocument ?? await documentState().catch(() => null);
        const probe = await page.evaluate(() => {
          const target = window as unknown as ProbeWindow; target.__flushAuthPerformance?.();
          return { transitions: target.__authTransitionProbe.transitions,
            longTasks: target.__authTransitionProbe.longTasks, longTasksDropped: target.__authTransitionProbe.longTasksDropped };
        }).catch(() => null);
        const differences = Object.fromEntries(metricNames.map(name => [name,
          typeof before?.[name] === "number" && typeof after?.[name] === "number" ? after[name] - before[name] : null]));
        const evidence = { mode, cpuRate: 1, performanceMode: "high", performanceProbeEnabled: true, actionStartedAt,
          priorDocument, currentDocument, actionWallMs: currentDocument && actionStartedAt ? currentDocument.now - actionStartedAt : null,
          metricsBefore: before, metricsAfter: after, metricsDifference: differences,
          metricUnits: "CDP duration metrics are seconds; heap sizes bytes; counts are cumulative deltas", cpu, profilerError, probe,
          attributionLimit: "Samples and wall time can include sandbox off-CPU/reclaim delays; no raster/GPU or production conclusion without corroboration" };
        const encoded = JSON.stringify(evidence);
        expect(Buffer.byteLength(encoded), "Only a bounded aggregate is emitted; no raw CPU profile or trace artifact").toBeLessThan(64 * 1024);
        console.log(`AUTH_ATTRIBUTION_EVIDENCE=${encoded}`);
        await session.send("Profiler.disable").catch(() => undefined);
        await session.send("Performance.disable").catch(() => undefined);
        await session.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => undefined);
        await session.detach().catch(() => undefined);
        await finish();
      }
    });
  }
});
