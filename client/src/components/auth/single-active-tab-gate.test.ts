import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const stylesheetHook = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) return { format: "module", shortCircuit: true, source: "export default {};" };
    return nextLoad(url, context);
  },
});
const { default: SingleActiveTabGate } = await import("./SingleActiveTabGate");
stylesheetHook.deregister();

const source = readFileSync(new URL("./SingleActiveTabGate.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./SingleActiveTabGate.css", import.meta.url), "utf8");

test("an unverified account render never mounts protected children or hydrates their content", () => {
  let childRenders = 0;
  function ProtectedContent() {
    childRenders += 1;
    return createElement("div", null, "Sensitive collection fixture");
  }
  for (const accountId of ["internal-account-42", "another-account", "", 42]) {
    const markup = renderToStaticMarkup(createElement(SingleActiveTabGate, {
      accountId,
      logoSrc: "/brand/sidebar-q-static.png",
      children: createElement(ProtectedContent),
    }));
    assert.match(markup, /data-single-tab-status="checking"/);
    assert.match(markup, /aria-busy="true"/);
    assert.match(markup, /role="status" aria-live="polite"/);
    assert.match(markup, /Menyemak tab aktif/);
    assert.doesNotMatch(markup, /Sensitive collection fixture/);
    assert.equal(childRenders, 0);
  }
});

test("gate uses the supplied real logo and no generated Q or production demo controls", () => {
  const markup = renderToStaticMarkup(createElement(SingleActiveTabGate, {
    accountId: "account-id",
    logoSrc: "/brand/sidebar-q-static.png",
    children: createElement("div", null, "protected"),
  }));
  assert.match(markup, /src="\/brand\/sidebar-q-static\.png"/);
  assert.match(markup, /aria-label="Sumbangan Query Rahmah"/);
  assert.doesNotMatch(source, /SvgIcon|<svg|<em>Q<|brand-mark|\bpreview\b|localStorage|sessionStorage|fetch\(/);
  assert.match(source, /<img src=\{logoSrc\} width=\{24\}/);
  assert.match(source, /from "lucide-react"/);
});

test("blocked copy and actions retain the approved BM semantics without shared-session logout", () => {
  for (const copy of [
    "Akaun anda sudah dibuka di tab lain. Sila gunakan tab asal untuk terus bekerja.",
    "Tab asal masih aktif", "Semak Semula", "Tutup Tab",
  ]) assert.ok(source.includes(copy));
  assert.match(source, /Tab tambahan <span>tidak dibenarkan\.<\/span>/);
  assert.match(source, /disabled=\{retrying \|\| unsupported\}/);
  assert.match(source, /window\.close\(\)/);
  assert.doesNotMatch(source, /logout\(|removeItem\(|document\.cookie|location\.(?:href|replace|assign)/);
  assert.match(source, /aria-busy=\{retrying\}/);
  assert.match(source, /type="button" onClick=\{onClose\}/);
});

test("account changes and restored pages must acquire fresh ownership before protected activation", () => {
  assert.match(source, /<AccountTabGate key=\{String\(props\.accountId\)\}/);
  assert.match(source, /onBeforeActivate\?: \(signal: AbortSignal\) => Promise<boolean>/);
  assert.match(source, /await validation\.current\(validationController\.signal\)/);
  assert.match(source, /!valid \|\| validationController\.signal\.aborted \|\| !lock\.active \|\| lock\.disposed/);
  assert.match(source, /serial === attemptSerial\.current && controller\.current === lock/);
  assert.match(source, /status === "active" && controller\.current\?\.active && !controller\.current\.disposed/);
  assert.match(source, /onOwnershipLost: \(\) =>/);
  assert.match(source, /const onPageHide = \(\) => \{[\s\S]*?flushSync\([\s\S]*?release\(\);/);
  assert.match(source, /event\.persisted && !disposed\) void acquire\(true\)/);
  for (const event of ["pagehide", "pageshow"]) {
    assert.ok(source.includes(`window.addEventListener("${event}"`));
    assert.ok(source.includes(`window.removeEventListener("${event}"`));
  }
  assert.match(source, /validationAbort\.current\?\.abort\(\)/);
});

test("gate styling is scoped, responsive and disables motion rather than shortening infinite loops", () => {
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:body|html|:root|\.dark|button|input|h1)\s*[{,]/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.06fr\) minmax\(0, \.94fr\)/);
  for (const breakpoint of [640, 767, 1023]) {
    assert.ok(css.includes(`@media (max-width: ${breakpoint}px)`));
  }
  assert.match(css, /flex: 1 1 130px; min-width: 0/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important; transition: none !important/);
  assert.doesNotMatch(css, /sqr-tab-float|animation-duration:\s*\.01ms/);
  assert.equal((css.match(/animation: [^;]+infinite/g) ?? []).length, 1, "only transient checking uses a spinner");
});

test("benefit strip contains only the two operational messages with balanced columns", () => {
  const benefits = source.match(/<div className="sqr-tab-benefits">([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.equal((benefits.match(/<span>/g) ?? []).length, 2);
  assert.match(benefits, /Tab asal tidak terjejas/);
  assert.match(benefits, /Semak jika tab asal ditutup/);
  assert.doesNotMatch(source, /Sesuai untuk komputer dan telefon|MonitorCheck/);
  assert.match(css, /\.sqr-tab-page \.sqr-tab-benefits \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
