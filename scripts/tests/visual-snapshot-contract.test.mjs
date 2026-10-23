import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../tests/visual/app.visual.spec.ts", import.meta.url), "utf8");
const stabilizer = readFileSync(new URL("../../tests/visual/visual-regression.css", import.meta.url), "utf8");
const monthlySource = readFileSync(new URL("../../tests/visual/collection-monthly-polish.spec.ts", import.meta.url), "utf8");
const landingImageSource = readFileSync(new URL("../../tests/visual/landing-image-a11y.spec.ts", import.meta.url), "utf8");

function sourceSection(content, start, end) {
  const startMatch = content.match(start);
  assert.ok(startMatch, `Expected source section ${start}`);
  const remaining = content.slice(startMatch.index + startMatch[0].length);
  const endMatch = remaining.match(end);
  assert.ok(endMatch, `Expected end of source section ${start}`);
  return startMatch[0] + remaining.slice(0, endMatch.index);
}

const section = (start, end) => sourceSection(source, start, end);

const navigation = section(/async\s+function\s+navigateForSnapshot\b/, /async\s+function\s+expectVisualBaseline\b/);

test("visual snapshots wait for loaded page controls instead of the application shell", () => {
  const routes = section(/const\s+authenticatedRoutes\b/, /function\s+buildVisualMasks\b/);
  const expectedControls = new Map([
    ["dashboard", "dashboard-login-command-bar"],
    ["sumbangan-form", "#save-collection-superuser-nickname"],
    ["admin-settings", "#setting-card-control-system_name"],
  ]);
  const routeObjects = [...routes.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
  for (const [id, control] of expectedControls) {
    const route = routeObjects.find((candidate) => new RegExp(`\\bid\\s*:\\s*["']${id}["']`).test(candidate));
    assert.ok(route, `Missing ${id} snapshot route`);
    const selector = route.match(/\breadySelector\s*:\s*(?:"([^"]*)"|'([^']*)')/);
    assert.ok(selector && (selector[1] ?? selector[2]).includes(control), `${id} must wait for ${control}`);
  }
  assert.doesNotMatch(routes, /readySelector\s*:\s*["']main#main-content["']/);
  assert.match(navigation, /locator\(\s*route\.readySelector\s*\)[\s\S]*?waitFor\(\s*\{\s*state\s*:\s*["']visible["']/);
  assert.match(navigation, /locator\(\s*["']html\.app-ready["']\s*\)\.waitFor\(\s*\{[^{}]*\}\s*\)\s*;/);
  assert.match(navigation, /document\.fonts\.ready/);
  assert.doesNotMatch(navigation, /waitForTimeout\s*\(/);
  assert.match(navigation, /toHaveValue\(\s*["']SQR Visual Baseline["']\s*\)/);
});

test("collection snapshots select a nickname and require the actual customer form", () => {
  const selection = section(/if\s*\(\s*route\.id\s*===\s*["']sumbangan-form["']\s*\)/,
    /if\s*\(\s*route\.id\s*===\s*["']admin-settings["']\s*\)/);
  assert.match(selection, /await\s+page\.locator\(\s*route\.readySelector\s*\)\.click\(\s*\)/);
  assert.match(selection, /getByRole\(\s*["']button["']\s*,\s*\{\s*name\s*:\s*["']Collector Alpha["']\s*,\s*exact\s*:\s*true\s*\}\s*\)\.click\(\s*\)/);
  assert.match(selection, /expect\(\s*page\.locator\(\s*["']#save-collection-customer-name["']\s*\)\s*\)\.toBeVisible\(\s*\)/);
  assert.match(selection, /toContainText\(\s*["']Collector Alpha["']\s*\)/);
});

test("the collection nickname fixture includes required API fields", () => {
  const nicknameResponse = section(/if\s*\(\s*pathname\s*===\s*["']\/api\/collection\/nicknames["']\s*\)/,
    /if\s*\(\s*request\.method\s*\(/);
  for (const property of ["id", "nickname", "roleScope"]) {
    assert.match(nicknameResponse, new RegExp(`\\b${property}\\s*:\\s*["'][^"']+["']`));
  }
  assert.match(nicknameResponse, /\bisActive\s*:\s*true\b/);
  assert.match(nicknameResponse, /\bcreatedBy\s*:\s*(?:visualUser\.id|["'][^"']+["'])/);
  const createdAt = nicknameResponse.match(/\bcreatedAt\s*:\s*["']([^"']+)["']/)?.[1];
  assert.ok(createdAt && Number.isFinite(Date.parse(createdAt)), "Nickname createdAt must be a valid fixed timestamp");
});

test("visual time and theme are deterministic and checked before capture", () => {
  const themeSetup = section(/async\s+function\s+installTheme\b/, /function\s+jsonResponse\b/);
  const fixedTime = themeSetup.match(/clock\.setFixedTime\(\s*new Date\(\s*["']([^"']+)["']\s*\)\s*\)/)?.[1];
  assert.ok(fixedTime && Number.isFinite(Date.parse(fixedTime)), "Use a fixed timestamp without pausing application timers");
  assert.match(themeSetup, /colorScheme\s*:\s*theme\b/);
  assert.match(themeSetup, /localStorage\.setItem\(\s*["']theme["']\s*,\s*nextTheme\s*\)/);
  assert.match(themeSetup, /if\s*\(\s*document\.documentElement\s*\)\s*applyTheme\(\s*\)/);
  assert.match(themeSetup, /addEventListener\(\s*["']DOMContentLoaded["']\s*,\s*applyTheme\s*,\s*\{\s*once\s*:\s*true\s*\}/);
  assert.match(themeSetup, /classList\.toggle\(\s*["']dark["']\s*,\s*nextTheme\s*===\s*["']dark["']\s*\)/);
  assert.match(themeSetup, /dataset\.theme\s*=\s*nextTheme/);
  const capture = section(/async\s+function\s+expectVisualBaseline\b/, /async\s+function\s+logoutVisualSession\b/);
  assert.match(capture, /toHaveAttribute\(\s*["']data-theme["']\s*,\s*theme\s*\)/);
  assert.match(capture, /classList\.contains\(\s*["']dark["']\s*\)[\s\S]*?\.toBe\(\s*theme\s*===\s*["']dark["']\s*\)/);
});

test("visual masks do not hide live content or whole classes of counters and dates", () => {
  const masks = section(/function\s+buildVisualMasks\b/, /async\s+function\s+installTheme\b/);
  for (const [label, content] of [["screenshot masks", masks], ["screenshot stylesheet", stabilizer]]) {
    assert.doesNotMatch(content, /\[\s*aria-live\b/, `${label} must preserve live content`);
    assert.doesNotMatch(content, /\[\s*data-testid\s*[*^$|~]=\s*["'](?:count|date|timestamp)["']/,
      `${label} must not hide arbitrary counters or dates`);
  }
});

test("light and dark snapshot tests execute independently after a failure", () => {
  assert.match(source, /visualThemes\s*:[^=]+?=\s*\[\s*["']light["']\s*,\s*["']dark["']\s*\]/);
  const cases = section(/for\s*\(\s*const\s+theme\s+of\s+visualThemes\s*\)/, /test\s*\(\s*["']dashboard scaling/);
  assert.equal([...cases.matchAll(/for\s*\(\s*const\s+theme\s+of\s+visualThemes\s*\)\s*\{\s*test\(/g)].length, 2,
    "Public and authenticated themes must each register independent test cases");
  assert.doesNotMatch(source, /test\.describe\.serial\b|mode\s*:\s*["']serial["']/);
});

test("Monthly text reflow actually doubles root text without bypassing production style CSP", () => {
  const reflow = sourceSection(monthlySource,
    /test\("Monthly text at 200 percent\b/,
    /for\s*\(\s*const\s+theme\s+of/);
  assert.match(reflow, /strictStyleCsp\s*:\s*true/);
  assert.match(reflow, /document\.documentElement\.style\.fontSize\s*=\s*["']200%["']/);
  assert.match(reflow, /toHaveCSS\(\s*["']font-size["']\s*,\s*["']32px["']\s*\)/);
  assert.doesNotMatch(reflow, /\baddStyleTag\s*\(|\bbypassCSP\s*:\s*true|unsafe-inline/);
  assert.match(reflow, /expectContainedMonthlyLayout\(page,\s*panel\)/);

  const documentFixture = sourceSection(monthlySource,
    /if\s*\(!url\.pathname\.startsWith\("\/api\/"\)\)/,
    /const\s+endpoint\s*=/);
  assert.match(documentFixture, /options\.strictStyleCsp\s*&&\s*request\.isNavigationRequest\(\)\s*&&\s*request\.resourceType\(\)\s*===\s*["']document["']/);
  assert.match(documentFixture, /const\s+headers\s*=\s*response\.headers\(\)/);
  assert.match(documentFixture, /headers\["content-security-policy"\]\s*=\s*\[headers\["content-security-policy"\],/);
  assert.match(documentFixture, /style-src 'self'; style-src-elem 'self'; style-src-attr 'none'/);
  assert.match(documentFixture, /\.filter\(Boolean\)\.join\(", "\)/);
  assert.match(documentFixture, /route\.fulfill\(\{\s*response,\s*headers\s*\}\)/);
  assert.doesNotMatch(documentFixture, /unsafe-inline|\bbypassCSP\s*:\s*true/);
  const originGuardIndex = monthlySource.indexOf("if (url.origin !== origin)");
  assert.ok(originGuardIndex >= 0, "The synthetic fixture must reject off-origin requests");
  assert.ok(originGuardIndex < monthlySource.indexOf(documentFixture),
    "The off-origin guard must run before the document fetch fixture");
});

test("landing accessibility auditing preserves strict script CSP on static and application previews", () => {
  assert.match(landingImageSource, /await\s+page\.evaluate\(axeSource\)/);
  assert.match(landingImageSource, /await\s+page\.locator\("html\.app-ready"\)\.waitFor\(\{\s*state:\s*"attached"\s*\}\)/);
  assert.match(landingImageSource, /page\.locator\("\.sqr-landing"\)\.getByRole\("heading"/);
  assert.doesNotMatch(landingImageSource, /\baddScriptTag\s*\(|\bbypassCSP\s*:|unsafe-inline|unsafe-eval/);
  const fixture = sourceSection(landingImageSource,
    /async\s+function\s+installPublicFixture\b/, /async\s+function\s+imageGeometry\b/);
  const documentFixture = sourceSection(fixture,
    /if\s*\(\s*request\.isNavigationRequest\(\)\s*&&\s*request\.resourceType\(\)\s*===\s*["']document["']\s*\)/,
    /return\s+route\.fulfill\(/);
  assert.match(documentFixture, /const\s+response\s*=\s*await\s+route\.fetch\(\)/);
  assert.match(documentFixture, /const\s+headers\s*=\s*response\.headers\(\)/);
  assert.match(landingImageSource, /const\s+strictScriptPolicy\s*=\s*"script-src 'self'; require-trusted-types-for 'script'"/);
  assert.match(documentFixture, /headers\["content-security-policy"\]\s*=\s*\[\s*headers\["content-security-policy"\],\s*strictScriptPolicy\s*\]/);
  assert.match(documentFixture, /\.filter\(Boolean\)\.join\(", "\)/);
  assert.match(fixture, /return\s+route\.fulfill\(\{\s*response,\s*headers\s*\}\)/);
  const originGuardIndex = fixture.indexOf("if (url.origin !== origin)");
  assert.ok(originGuardIndex >= 0, "The landing fixture must reject off-origin requests");
  assert.ok(originGuardIndex < fixture.indexOf(documentFixture),
    "The origin guard must run before fetching a navigation document");
});

test("Monthly captures await app, theme and font readiness before taking full-page snapshots", () => {
  const capture = sourceSection(monthlySource,
    /test\(`Monthly visual ledger \$\{theme\} at \$\{width\}px/,
    /for\s*\(\s*const\s+role\s+of/);
  for (const readiness of [
    'page.locator("html.app-ready").waitFor({ state: "attached" })',
    'toHaveAttribute("data-theme", theme)',
    "document.fonts.ready",
    "page.mouse.move(0, 0)",
  ]) {
    const readinessIndex = capture.indexOf(readiness);
    assert.ok(readinessIndex >= 0, `Missing Monthly capture readiness: ${readiness}`);
    assert.ok(readinessIndex < capture.indexOf("toHaveScreenshot("),
      `${readiness} must be checked before the baseline assertion`);
  }
  assert.match(capture, /toHaveScreenshot\([^\n]+\{\s*fullPage:\s*true\s*\}/);
  assert.doesNotMatch(capture, /maxDiffPixelRatio|maxDiffPixels|\bmask\s*:/,
    "Monthly platform baselines must not weaken visual limits or mask the report");
});

test("only Monthly phone baselines distinguish operating-system font metrics", () => {
  assert.match(monthlySource, /const\s+platformSuffix\s*=\s*width\s*===\s*390\s*\?\s*`-\$\{process\.platform\}`\s*:\s*""/);
  assert.match(monthlySource, /toHaveScreenshot\(`monthly-visual-ledger-\$\{theme\}-\$\{width\}\$\{platformSuffix\}\.png`/);

  const pngDimensions = (name) => {
    const png = readFileSync(new URL(`../../tests/visual/__snapshots__/collection-monthly-polish.spec.ts/${name}`, import.meta.url));
    assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${name} must have a PNG signature`);
    assert.equal(png.readUInt32BE(8), 13, `${name} must have a complete IHDR`);
    assert.equal(png.toString("ascii", 12, 16), "IHDR");
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  };
  const phoneHeights = new Map();
  for (const theme of ["light", "dark"]) {
    const desktop = pngDimensions(`monthly-visual-ledger-${theme}-1366.png`);
    assert.equal(desktop.width, 1366, "Desktop keeps the reviewed shared baseline");
    assert.ok(desktop.height >= 1000);
    for (const platform of ["linux", "win32"]) {
      const phone = pngDimensions(`monthly-visual-ledger-${theme}-390-${platform}.png`);
      assert.equal(phone.width, 390);
      assert.ok(phone.height > 1000, "Phone baselines must cover the full report rather than crop it to the viewport");
      if (phoneHeights.has(platform)) assert.equal(phone.height, phoneHeights.get(platform), "Light and dark report geometry must agree");
      phoneHeights.set(platform, phone.height);
    }
  }
});
