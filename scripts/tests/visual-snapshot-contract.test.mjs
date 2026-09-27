import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../tests/visual/app.visual.spec.ts", import.meta.url), "utf8");
const stabilizer = readFileSync(new URL("../../tests/visual/visual-regression.css", import.meta.url), "utf8");

function section(start, end) {
  const startMatch = source.match(start);
  assert.ok(startMatch, `Expected source section ${start}`);
  const remaining = source.slice(startMatch.index + startMatch[0].length);
  const endMatch = remaining.match(end);
  assert.ok(endMatch, `Expected end of source section ${start}`);
  return startMatch[0] + remaining.slice(0, endMatch.index);
}

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
