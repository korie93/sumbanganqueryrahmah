import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { SQR_BRAND_ASSETS } from "@shared/brand-assets";

const bootShellScript = readFileSync(
  fileURLToPath(new URL("../../public/boot-shell.js", import.meta.url)),
  "utf8",
);
const bootShellStyles = readFileSync(
  fileURLToPath(new URL("../../public/boot-shell.css", import.meta.url)),
  "utf8",
);

test("public landing boot paints a compact loader matching the current hero", () => {
  assert.match(bootShellScript, /"\/":\s*\{\s*mode:\s*"landing"/);
  assert.match(
    bootShellScript,
    /title: "Loading SQR…"/,
  );
  assert.match(
    bootShellScript,
    /setAttribute\("data-boot-shell", shell\.mode\)/,
  );
  assert.match(
    bootShellStyles,
    /html\[data-boot-shell="landing"\] \.public-auth-boot-shell\s*\{/,
  );
  assert.match(
    bootShellStyles,
    /html\[data-boot-shell="landing"\] \.public-auth-boot-shell__fields\s*\{\s*display:\s*none;/,
  );
  assert.doesNotMatch(bootShellScript, /Operational data, structured|SQR consolidates search/);
  assert.match(bootShellStyles, /html\[data-boot-shell="landing"\] \.public-auth-boot-shell\s*\{[^}]*background:\s*#000;/);
  assert.match(bootShellStyles, /html\[data-boot-shell="landing"\] \.public-auth-boot-shell__content\s*\{[^}]*visibility:\s*hidden;/);
  assert.match(bootShellStyles, /html\[data-boot-shell="landing"\]\[data-landing-boot-ready="true"\] \.public-auth-boot-shell__content\s*\{\s*visibility:\s*visible;/);
});

type BootOptions = {
  readyState?: "loading" | "interactive" | "complete";
  rootHasChildren?: boolean;
  shellCopyAvailable?: boolean;
  initialAuthCopy?: boolean;
  cookie?: string;
  storedUser?: string;
  banned?: string;
  maintenance?: boolean;
  blockedCookie?: boolean;
  blockedStorage?: boolean;
  blockedStorageRead?: boolean;
  storedTheme?: string;
  legacyTheme?: string;
  prefersDark?: boolean;
  blockedThemeStorage?: boolean;
  blockedThemeRead?: boolean;
  hints?: Array<{ name: string; content: string; media?: string; theme?: string }>;
};

const validHints = [
  { name: "sqr-landing-script", content: "/assets/Landing-fixture.js" },
  { name: "sqr-landing-style", content: "/assets/Landing-fixture.css" },
];
const radarHints = [
  { name: "sqr-landing-image", content: "/landing-next/radar-animated.svg", media: "(prefers-reduced-motion: no-preference)" },
  { name: "sqr-landing-image", content: "/landing-next/radar-static.svg", media: "(prefers-reduced-motion: reduce)" },
];

function runBootShell(pathname: string, options: BootOptions = {}) {
  const elements = new Map<string, { textContent: string }>([
    ["boot-shell-eyebrow", { textContent: options.initialAuthCopy ? "SQR System" : "" }],
    ["boot-shell-title", { textContent: options.initialAuthCopy ? "Log In SQR System" : "" }],
    ["boot-shell-copy", { textContent: options.initialAuthCopy ? "Platform operasi dalaman Sumbangan Query Rahmah sedang disediakan." : "" }],
  ]);
  const attributes = new Map<string, string>();
  const brandAttributes = new Map<string, string>([["src", "/brand/sqr-q-mark-dark.png"]]);
  const brand = { setAttribute(name: string, value: string) {
    assert.equal(name, "src");
    brandAttributes.set(name, value);
  } };
  const documentElement = {
    lang: "en",
    setAttribute(name: string, value: string) { attributes.set(name, value); },
  };
  const links: Array<Record<string, string>> = [];
  const readyCallbacks: Array<() => void> = [];
  let shellCopyAvailable = options.shellCopyAvailable !== false;
  const sessionStorage = {
    getItem(key: string) {
      if (options.blockedStorageRead) throw new Error("Storage read denied");
      return key === "user" ? options.storedUser ?? null : key === "banned" ? options.banned ?? null : null;
    },
    setItem() { assert.fail("Resource hints must never write authentication state"); },
    removeItem() { assert.fail("Resource hints must never remove authentication state"); },
    clear() { assert.fail("Resource hints must never clear authentication state"); },
  };
  const window = {
    location: { pathname },
    get localStorage() {
      if (options.blockedThemeStorage) throw new Error("Theme storage unavailable");
      return {
        getItem(key: string) {
          if (options.blockedThemeRead) throw new Error("Theme storage read denied");
          return key === "theme" ? options.storedTheme ?? null
            : key === "sqr-landing-next-theme" ? options.legacyTheme ?? null : null;
        },
        setItem() { assert.fail("Resource hints must never write theme preferences"); },
        removeItem() { assert.fail("Resource hints must never remove theme preferences"); },
      };
    },
    matchMedia(query: string) {
      assert.equal(query, "(prefers-color-scheme: dark)");
      return { matches: options.prefersDark ?? false };
    },
    get sessionStorage() {
      if (options.blockedStorage) throw new Error("Storage unavailable");
      return sessionStorage;
    },
  };
  runInNewContext(bootShellScript, {
    window,
    document: {
      documentElement,
      readyState: options.readyState ?? "complete",
      addEventListener(name: string, callback: () => void, listenerOptions: { once: boolean }) {
        assert.equal(name, "DOMContentLoaded");
        assert.equal(listenerOptions.once, true);
        readyCallbacks.push(callback);
      },
      get cookie() {
        if (options.blockedCookie) throw new Error("Cookies unavailable");
        return options.cookie ?? "";
      },
      set cookie(_value: string) { assert.fail("Resource hints must never mutate session cookies"); },
      querySelector(selector: string) {
        if (selector === "#boot-shell .public-auth-boot-shell__brand") return shellCopyAvailable ? brand : null;
        assert.equal(selector, 'meta[name="sqr-maintenance"][content="active"]');
        return options.maintenance ? {} : null;
      },
      querySelectorAll(selector: string) {
        const expected = pathname === "/login"
          ? 'meta[name="sqr-login-script"], meta[name="sqr-login-style"], meta[name="sqr-login-image"]'
          : 'meta[name="sqr-landing-script"], meta[name="sqr-landing-style"], meta[name="sqr-landing-image"]';
        assert.equal(selector, expected);
        return (options.hints ?? []).filter(hint => selector.includes(`meta[name="${hint.name}"]`)).map(hint => ({
          getAttribute(name: string) { return name === "name" ? hint.name : name === "content" ? hint.content
            : name === "media" ? hint.media ?? null : name === "data-theme" ? hint.theme ?? null : null; },
        }));
      },
      createElement(name: string) {
        assert.equal(name, "link", "Preloading must not execute a script or apply a stylesheet");
        return {};
      },
      head: { appendChild(link: Record<string, string>) { links.push(link); } },
      getElementById(id: string) {
        if (id === "root") return { hasChildNodes: () => options.rootHasChildren === true };
        return shellCopyAvailable ? elements.get(id) : null;
      },
    },
  });
  return {
    documentElement, attributes, elements, links, readyCallbacks, brandAttributes,
    finishParsing() {
      shellCopyAvailable = true;
      for (const callback of readyCallbacks.splice(0)) callback();
    },
  };
}

test("async boot discovers assets before DOM ready and safely waits for shell copy", () => {
  const result = runBootShell("/", {
    readyState: "loading", shellCopyAvailable: false, hints: validHints,
  });
  assert.equal(result.links.length, 2, "Hints must not wait for CSS-delayed DOMContentLoaded");
  assert.equal(result.elements.get("boot-shell-title")?.textContent, "");
  assert.equal(result.readyCallbacks.length, 1);
  result.finishParsing();
  assert.equal(result.elements.get("boot-shell-title")?.textContent, "Loading SQR…");
  assert.equal(result.brandAttributes.get("src"), SQR_BRAND_ASSETS.transparentIcon);
  assert.equal(result.attributes.get("data-landing-boot-ready"), "true");
  assert.equal(result.links.length, 2, "DOM readiness must not duplicate resource hints");
});

test("async boot applies shell copy immediately when document parsing has finished", () => {
  for (const readyState of ["interactive", "complete"] as const) {
    const result = runBootShell("/login", { readyState });
    assert.equal(result.readyCallbacks.length, 0);
    assert.equal(result.elements.get("boot-shell-title")?.textContent, "Log In SQR System");
  }
});

test("landing replaces the shared auth copy before DOMContentLoaded when its nodes exist", () => {
  const result = runBootShell("/", { readyState: "loading", initialAuthCopy: true });
  assert.equal(result.elements.get("boot-shell-title")?.textContent, "Loading SQR…");
  assert.equal(result.elements.get("boot-shell-eyebrow")?.textContent, "");
  assert.equal(result.elements.get("boot-shell-copy")?.textContent, "");
  assert.equal(result.brandAttributes.get("src"), SQR_BRAND_ASSETS.transparentIcon);
  assert.equal(result.attributes.get("data-landing-boot-ready"), "true");
  assert.equal(result.readyCallbacks.length, 1, "The parsing fallback remains available for shared HTML");
  result.finishParsing();
  assert.equal(result.elements.get("boot-shell-title")?.textContent, "Loading SQR…");
});

test("unparsed root content stays hidden until its loading copy and real Q are ready", () => {
  const result = runBootShell("/", { readyState: "loading", shellCopyAvailable: false, initialAuthCopy: true });
  assert.equal(result.attributes.has("data-landing-boot-ready"), false);
  assert.equal(result.elements.get("boot-shell-title")?.textContent, "Log In SQR System");
  assert.equal(result.brandAttributes.get("src"), "/brand/sqr-q-mark-dark.png");
  result.finishParsing();
  assert.equal(result.attributes.get("data-landing-boot-ready"), "true");
  assert.equal(result.brandAttributes.get("src"), SQR_BRAND_ASSETS.transparentIcon);
});

test("all auth boot routes preserve their copy, brand and DOMContentLoaded timing", () => {
  for (const [pathname, title] of [
    ["/login", "Log In SQR System"], ["/forgot-password", "Lupa Kata Laluan"],
    ["/activate-account", "Aktifkan Akaun"], ["/reset-password", "Reset Kata Laluan"],
    ["/maintenance", "Status Penyelenggaraan"],
  ]) {
    const result = runBootShell(pathname, { readyState: "loading" });
    assert.equal(result.elements.get("boot-shell-title")?.textContent, "", pathname);
    assert.equal(result.attributes.get("data-boot-shell"), "public-auth", pathname);
    assert.equal(result.attributes.has("data-landing-boot-ready"), false, pathname);
    result.finishParsing();
    assert.equal(result.elements.get("boot-shell-title")?.textContent, title, pathname);
    assert.equal(result.brandAttributes.get("src"), "/brand/sqr-q-mark-dark.png", pathname);
    assert.equal(result.attributes.has("data-landing-boot-ready"), false, pathname);
  }
});

test("late async boot leaves metadata, shell and preloads untouched once React owns the root", () => {
  for (const pathname of ["/", "/login"]) {
    const result = runBootShell(pathname, { rootHasChildren: true, hints: [...validHints, ...radarHints] });
    assert.equal(result.documentElement.lang, "en", "Existing app metadata must remain unchanged");
    assert.equal(result.attributes.size, 0);
    assert.equal(result.links.length, 0);
    assert.equal(result.readyCallbacks.length, 0);
    assert.equal(result.elements.get("boot-shell-title")?.textContent, "");
  }
});

test("landing boot uses English while direct login retains its original Malay copy", () => {
  const landing = runBootShell("/");
  assert.equal(landing.documentElement.lang, "en");
  assert.equal(landing.attributes.get("data-boot-shell"), "landing");
  assert.equal(landing.elements.get("boot-shell-eyebrow")?.textContent, "");
  assert.equal(landing.elements.get("boot-shell-title")?.textContent, "Loading SQR…");
  assert.equal(landing.elements.get("boot-shell-copy")?.textContent, "");
  assert.equal(landing.brandAttributes.get("src"), SQR_BRAND_ASSETS.transparentIcon);

  const login = runBootShell("/login");
  assert.equal(login.documentElement.lang, "ms");
  assert.equal(login.attributes.get("data-boot-shell"), "public-auth");
  assert.equal(login.elements.get("boot-shell-title")?.textContent, "Log In SQR System");
  assert.equal(login.elements.get("boot-shell-copy")?.textContent, "Platform operasi dalaman Sumbangan Query Rahmah sedang disediakan.");
});

test("direct internal routes retain Malay and do not select the public landing boot", () => {
  const internal = runBootShell("/general-search");
  assert.equal(internal.documentElement.lang, "ms");
  assert.equal(internal.attributes.has("data-boot-shell"), false);
});

test("anonymous root preloads build-provided landing resources without applying their CSS", () => {
  const result = runBootShell("/", { hints: validHints });
  assert.equal(result.links.length, 2);
  assert.deepEqual({ ...result.links[0] }, { href: validHints[0].content, rel: "modulepreload", crossOrigin: "anonymous", fetchPriority: "high" });
  assert.deepEqual({ ...result.links[1] }, { href: validHints[1].content, rel: "preload", as: "style", crossOrigin: "anonymous", fetchPriority: "high" });
  assert.equal(result.links.some(link => link.rel === "stylesheet"), false);
  const multipleStyles = runBootShell("/", { hints: [...validHints, { name: "sqr-landing-style", content: "/assets/Shared-style_2.css" }] });
  assert.equal(multipleStyles.links.length, 3);
  assert.equal(runBootShell("/").links.length, 0, "Development HTML may omit optional build hints");
});

test("landing preloads never run on auth, protected, maintenance or unknown routes", () => {
  for (const pathname of ["/login", "/LOGIN", "/forgot-password", "/activate-account", "/reset-password", "/change-password", "/maintenance", "/banned", "/general-search", "/dashboard", "/settings", "/collection/save", "/unknown", "//"]) {
    assert.equal(runBootShell(pathname, { hints: [...validHints, ...radarHints] }).links.length, 0, pathname);
  }
});

test("session or maintenance hints leave existing authentication routing in charge", () => {
  for (const options of [
    { cookie: "sqr_auth_hint=1" },
    { cookie: "theme=dark; sqr_auth_hint=; another=value" },
    { storedUser: "synthetic-user" },
    { banned: "1" },
    { maintenance: true },
  ]) {
    const result = runBootShell("/", { ...options, hints: [...validHints, ...radarHints] });
    assert.equal(result.links.length, 0, JSON.stringify(options));
    assert.equal(result.attributes.get("data-boot-shell"), "landing", "Optimization must not change shell selection");
  }
  assert.equal(runBootShell("/", { cookie: "other_sqr_auth_hint=1; theme=light", banned: "0", hints: validHints }).links.length, 2);
});

test("denied cookie or storage access skips optional preloading and still paints the boot shell", () => {
  for (const options of [{ blockedCookie: true }, { blockedStorage: true }, { blockedStorageRead: true }]) {
    const result = runBootShell("/", { ...options, hints: [...validHints, ...radarHints] });
    assert.equal(result.links.length, 0);
    assert.ok(result.elements.get("boot-shell-title")?.textContent, "A failed optimization must not block the boot copy");
  }
});

test("preload metadata accepts only emitted same-origin assets with matching extensions", () => {
  for (const hint of [
    { name: "sqr-landing-script", content: "https://outside.invalid/asset.js" },
    { name: "sqr-landing-style", content: "//outside.invalid/asset.css" },
    { name: "sqr-landing-script", content: "/assets/../private.js" },
    { name: "sqr-landing-script", content: "/assets/%2e%2e.js" },
    { name: "sqr-landing-script", content: "/assets/nested/asset.js" },
    { name: "sqr-landing-script", content: "/assets/asset.js?query=1" },
    { name: "sqr-landing-script", content: "/assets/asset.css" },
    { name: "sqr-landing-style", content: "/assets/asset.js" },
    { name: "sqr-landing-style", content: "/other/asset.css" },
    { name: "sqr-landing-style", content: "" },
  ]) assert.equal(runBootShell("/", { hints: [hint] }).links.length, 0, hint.content);
});

test("anonymous root publishes one matching radar preload per motion preference before DOM readiness", () => {
  const result = runBootShell("/", { hints: [...radarHints, ...validHints], readyState: "loading" });
  const images = result.links.filter(link => link.as === "image");
  assert.equal(images.length, 2, "Media conditions leave the matching request to the browser");
  for (const [preference, expected] of [["no-preference", "animated"], ["reduce", "static"]]) {
    const matching = images.filter(link => link.media === `(prefers-reduced-motion: ${preference})`);
    assert.equal(matching.length, 1);
    assert.deepEqual({ ...matching[0] }, {
      href: `/landing-next/radar-${expected}.svg`, media: `(prefers-reduced-motion: ${preference})`,
      fetchPriority: "high", rel: "preload", as: "image",
    }, "The ordinary img and preload share no-CORS mode for request reuse");
  }
  assert.equal(result.readyCallbacks.length, 1);
  result.finishParsing();
  assert.equal(result.links.filter(link => link.as === "image").length, 2, "Parsing completion must not create duplicate preloads");
});

test("radar preload rejects foreign assets and missing, inverted or arbitrary media conditions", () => {
  for (const hint of [
    { name: "sqr-landing-image", content: "https://outside.invalid/radar-animated.svg", media: radarHints[0]!.media },
    { name: "sqr-landing-image", content: "//outside.invalid/radar-static.svg", media: radarHints[1]!.media },
    { name: "sqr-landing-image", content: "/landing-next/../radar-animated.svg", media: radarHints[0]!.media },
    { name: "sqr-landing-image", content: "/landing-next/radar-animated.svg?query=1", media: radarHints[0]!.media },
    { name: "sqr-landing-image", content: "/landing-next/search-dark-animated.svg", media: radarHints[0]!.media },
    { ...radarHints[0]!, media: "all" }, { ...radarHints[0]!, media: radarHints[1]!.media },
    { ...radarHints[1]!, media: radarHints[0]!.media }, { name: "sqr-landing-image", content: radarHints[0]!.content },
  ]) assert.equal(runBootShell("/", { hints: [hint] }).links.length, 0, JSON.stringify(hint));
});

const validLoginHints = [
  { name: "sqr-login-image", content: "/assets/sqr-illustration-fixture.webp", theme: "light" },
  { name: "sqr-login-script", content: "/assets/Login-fixture.js" },
  { name: "sqr-login-script", content: "/assets/Shared-auth_fixture.js" },
  { name: "sqr-login-style", content: "/assets/AuthV17Layout-fixture.css" },
  { name: "sqr-login-image", content: "/assets/sqr-illustration-dark-fixture.webp", theme: "dark" },
];

test("anonymous exact login preloads its scripts, styles and LCP image without applying CSS", () => {
  const result = runBootShell("/login", { hints: [...validHints, ...radarHints, ...validLoginHints] });
  assert.equal(result.links.length, 4);
  assert.deepEqual({ ...result.links[0] }, {
    href: validLoginHints[0].content, rel: "preload", as: "image", fetchPriority: "high",
  }, "CSS background-image reuse requires no crossorigin attribute on the image preload");
  assert.deepEqual({ ...result.links[1] }, {
    href: validLoginHints[1].content, rel: "modulepreload", crossOrigin: "anonymous", fetchPriority: "high",
  });
  assert.deepEqual({ ...result.links[3] }, {
    href: validLoginHints[3].content, rel: "preload", as: "style", crossOrigin: "anonymous", fetchPriority: "high",
  });
  assert.equal(result.links.some(link => link.rel === "stylesheet"), false);
  assert.equal(result.attributes.get("data-boot-shell"), "public-auth");
  assert.equal(runBootShell("/login").links.length, 0, "Development HTML omits optional build hints");
});

test("login preloads one exact illustration for canonical preference, legacy fallback or system theme", () => {
  const cases: Array<{ options: BootOptions; expected: "light" | "dark" }> = [
    { options: { storedTheme: "dark", legacyTheme: "light", prefersDark: false }, expected: "dark" },
    { options: { storedTheme: "light", legacyTheme: "dark", prefersDark: true }, expected: "light" },
    { options: { legacyTheme: "dark", prefersDark: false }, expected: "dark" },
    { options: { storedTheme: "invalid", legacyTheme: "light", prefersDark: true }, expected: "light" },
    { options: { storedTheme: "invalid", legacyTheme: "invalid", prefersDark: true }, expected: "dark" },
    { options: { prefersDark: false }, expected: "light" },
    { options: { blockedThemeStorage: true, prefersDark: true }, expected: "dark" },
    { options: { blockedThemeRead: true, storedTheme: "light", prefersDark: true }, expected: "dark" },
  ];
  for (const { options, expected } of cases) {
    const result = runBootShell("/login", { ...options, hints: validLoginHints });
    const images = result.links.filter(link => link.as === "image");
    assert.equal(images.length, 1);
    assert.equal(images[0]!.href, expected === "dark"
      ? "/assets/sqr-illustration-dark-fixture.webp" : "/assets/sqr-illustration-fixture.webp");
    assert.equal(result.links.filter(link => link.as !== "image").length, 3,
      "Theme reads never block script/style preloading");
    assert.equal(images[0]!.crossOrigin, undefined, "CSS image and preload must retain matching no-CORS mode");
    assert.equal(images[0]!.media, undefined, "A saved choice must override the OS media preference");
  }
});

test("login resources never preload on landing, other auth, internal or noncanonical routes", () => {
  for (const pathname of ["/", "/LOGIN", "/login/", "/forgot-password", "/activate-account", "/reset-password", "/maintenance", "/banned", "/general-search", "/settings", "/unknown"]) {
    assert.equal(runBootShell(pathname, { hints: validLoginHints }).links.length, 0, pathname);
  }
  const landing = runBootShell("/", { hints: [...validHints, ...validLoginHints] });
  assert.equal(landing.links.length, 2);
  assert.ok(landing.links.every(link => link.href.includes("Landing-")));
});

test("login preloading cannot bypass session, maintenance or storage-denied guards", () => {
  for (const options of [
    { cookie: "sqr_auth_hint=1" }, { cookie: "theme=dark; sqr_auth_hint=; another=value" },
    { storedUser: "synthetic-user" }, { banned: "1" }, { maintenance: true },
    { blockedCookie: true }, { blockedStorage: true }, { blockedStorageRead: true },
  ]) {
    const result = runBootShell("/login", { ...options, hints: validLoginHints });
    assert.equal(result.links.length, 0, JSON.stringify(options));
    assert.ok(result.elements.get("boot-shell-title")?.textContent);
  }
  assert.equal(runBootShell("/login", {
    cookie: "other_sqr_auth_hint=1", banned: "0", hints: validLoginHints,
  }).links.length, 4);
});

test("login preload rejects external, traversal, mismatched and nonillustration asset URLs", () => {
  for (const hint of [
    { name: "sqr-login-script", content: "https://outside.invalid/asset.js" },
    { name: "sqr-login-style", content: "//outside.invalid/asset.css" },
    { name: "sqr-login-script", content: "/assets/../private.js" },
    { name: "sqr-login-script", content: "/assets/%2e%2e.js" },
    { name: "sqr-login-script", content: "/assets/nested/asset.js" },
    { name: "sqr-login-script", content: "/assets/asset.js?query=1" },
    { name: "sqr-login-script", content: "/assets/asset.css" },
    { name: "sqr-login-style", content: "/assets/asset.js" },
    { name: "sqr-login-image", content: "https://outside.invalid/sqr-illustration-a.webp" },
    { name: "sqr-login-image", content: "/assets/sqr-illustration-a.webp?query=1" },
    { name: "sqr-login-image", content: "/assets/../sqr-illustration-a.webp" },
    { name: "sqr-login-image", content: "/assets/another-image.webp" },
    { name: "sqr-login-image", content: "/assets/sqr-illustration-a.svg" },
    { name: "sqr-login-image", content: "/assets/sqr-illustration.webp" },
    { name: "sqr-login-image", content: "" },
  ]) assert.equal(runBootShell("/login", { hints: [{ ...hint, theme: "light" }] }).links.length, 0, hint.content);
  for (const hint of [
    { name: "sqr-login-image", content: "/assets/sqr-illustration-fixture.webp" },
    { name: "sqr-login-image", content: "/assets/sqr-illustration-fixture.webp", theme: "invalid" },
    { name: "sqr-login-image", content: "/assets/sqr-illustration-dark-fixture.webp", theme: "light" },
  ]) assert.equal(runBootShell("/login", { hints: [hint] }).links.length, 0, JSON.stringify(hint));
  assert.equal(runBootShell("/login", { storedTheme: "dark", hints: [
    { name: "sqr-login-image", content: "/assets/sqr-illustration-fixture.webp", theme: "dark" },
  ] }).links.length, 0, "Dark metadata cannot select the original light illustration");
});
