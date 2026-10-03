import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";
import { reviewRedesignAccessibilityViolations, runRedesignAccessibility } from "./lib/frontend-redesign-accessibility.mjs";

const routes = [
  { id: "home", path: "/", ready: "[data-testid='card-general-search']" },
  { id: "general-search", path: "/general-search", ready: "[data-testid='input-search']" },
  { id: "collection-records", path: "/collection/records", ready: "[data-testid='collection-records-page']" },
  { id: "dashboard", path: "/dashboard", ready: "[data-dashboard-export-root]" },
  { id: "collection-report", path: "/collection/save", ready: "#save-collection-superuser-nickname", collectionSave: true },
  { id: "collection-summary", path: "/collection/summary", ready: "main#main-content", collectionSummary: true },
  { id: "collection-monthly", path: "/collection/monthly-comparison", ready: "#collection-monthly-comparison-start-month", collectionMonthly: true },
  { id: "collection-daily", path: "/collection/daily", ready: "[data-testid='collection-daily-page']" },
  { id: "billing-principal", path: "/collection/billing-principal", ready: "[data-testid='billing-principal-page']" },
  { id: "saved", path: "/saved", ready: "[data-testid='button-view-fixture-card-source-a']" },
  { id: "viewer", path: "/saved", ready: "[data-testid='button-view-fixture-card-source-a']", viewer: true },
  { id: "import", path: "/import", ready: "[data-testid='tab-single-import']" },
  { id: "analysis", path: "/monitor?section=analysis", ready: "[data-testid='text-analysis-title']" },
  { id: "activity", path: "/monitor?section=activity", ready: "[data-testid='button-toggle-filters']" },
  { id: "settings", path: "/settings", ready: "main#main-content", settings: true },
  { id: "roles", path: "/settings", ready: "main#main-content", roles: true },
];

export function resolveRedesignBillingFixtureEnabled(env = {}) {
  const value = env.SQR_REDESIGN_BILLING_FIXTURE;
  assert.ok(value === undefined || value === "" || value === "0" || value === "1", "SQR_REDESIGN_BILLING_FIXTURE accepts only 0 or 1");
  return value === "1";
}

export function resolveRedesignCaptureOptions(env = {}, final = false) {
  const csv = (key) => [...new Set(String(env[key] || "").split(",").map((value) => value.trim()).filter(Boolean))];
  const routeIds = csv("SQR_REDESIGN_ROUTES");
  const widthValues = csv("SQR_REDESIGN_WIDTHS");
  const themes = csv("SQR_REDESIGN_THEMES");
  const checks = csv("SQR_REDESIGN_CHECKS");
  assert.ok(routeIds.every((id) => id === "login" || routes.some((route) => route.id === id)), "Unknown SQR_REDESIGN_ROUTES value");
  assert.ok(widthValues.every((value) => /^\d+$/.test(value) && Number(value) >= 320 && Number(value) <= 2560), "SQR_REDESIGN_WIDTHS must contain integer widths from 320 to 2560");
  assert.ok(themes.every((theme) => ["light", "dark"].includes(theme)), "SQR_REDESIGN_THEMES accepts light,dark");
  assert.ok(checks.every((check) => ["shell", "search", "collection", "collection-export", "saved", "viewer", "settings", "settings-deep-links", "monitor", "activity", "daily", "a11y"].includes(check)), "SQR_REDESIGN_CHECKS accepts shell,search,collection,collection-export,saved,viewer,settings,settings-deep-links,monitor,activity,daily,a11y");
  return {
    routeIds: routeIds.length ? routeIds : ["login", ...routes.map((route) => route.id)],
    widths: widthValues.length ? widthValues.map(Number) : final ? [1440, 390, 1280, 1024, 768, 430, 360, 320] : [1440, 390, 1024, 768, 430, 360],
    themes: themes.length ? themes : ["light", "dark"],
    checks,
  };
}

async function assertFocus(page, locator, label) {
  const target = await locator.elementHandle();
  assert.ok(target, `${label}: expected focus target exists`);
  try {
    const focused = await page.waitForFunction((element) => element === document.activeElement, target, { timeout: 3_000 }).then(() => true).catch(() => false);
    assert.equal(focused, true, label);
  } finally { await target.dispose(); }
}

async function assertFocusWithin(page, locator, label) {
  const target = await locator.elementHandle();
  assert.ok(target, `${label}: expected surface exists`);
  try {
    const focused = await page.waitForFunction((element) => element.contains(document.activeElement), target, { timeout: 3_000 }).then(() => true).catch(() => false);
    assert.equal(focused, true, label);
  } finally { await target.dispose(); }
}

async function assertDialogFits(dialog, label, diagnostics = []) {
  const bounds = await dialog.evaluate(async (element) => {
    const finiteAnimations = element.getAnimations().filter((animation) => Number.isFinite(animation.effect?.getTiming().iterations ?? Infinity));
    await Promise.race([
      Promise.allSettled(finiteAnimations.map((animation) => animation.finished)),
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight, transform: getComputedStyle(element).transform };
  });
  diagnostics.push({ label, ...bounds });
  assert.ok(bounds.left >= -1 && bounds.right <= bounds.width + 1 && bounds.top >= -1 && bounds.bottom <= bounds.height + 1, `${label} fits viewport: ${JSON.stringify(bounds)}`);
}

async function assertButtonContentsFit(button, label, diagnostics) {
  const layout = await button.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const contents = [...element.children].map((child) => child.getBoundingClientRect());
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (text.nextNode()) {
      if (!text.currentNode.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(text.currentNode);
      contents.push(...range.getClientRects());
    }
    const visibleContents = contents.filter((rect) => rect.width > 0 && rect.height > 0);
    return {
      width: bounds.width,
      height: bounds.height,
      contentCount: visibleContents.length,
      outsideCount: visibleContents.filter((rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1
        || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1).length,
    };
  });
  diagnostics.push({ label, ...layout });
  assert.ok(layout.width > 0 && layout.height > 0 && layout.contentCount > 0, `${label} contains visible controls`);
  assert.equal(layout.outsideCount, 0, `${label} keeps icon, label and count inside the button`);
}

async function verifyModalMenuKeyboard(page, state) {
  const menu = page.getByRole("menu");
  await menu.waitFor();
  assert.equal(await menu.count(), 1, "Manual menu review has one active popup");
  const menuId = await menu.getAttribute("id");
  assert.ok(menuId, "Manual menu review has an explicit popup identity");
  const openTrigger = page.locator(`button[aria-controls=${JSON.stringify(menuId)}]`);
  assert.equal(await openTrigger.count(), 1, "Manual menu review popup has one owning trigger");
  // Radix removes aria-controls when the popup closes. Retain the actual
  // trigger's stable id so Escape restoration and reopen inspect the same node.
  const triggerId = await openTrigger.getAttribute("id");
  assert.ok(triggerId, "Manual menu review trigger has a stable identity");
  const trigger = page.locator(`button[id=${JSON.stringify(triggerId)}]`);
  assert.equal(await trigger.getAttribute("aria-expanded"), "true");
  assert.equal(await trigger.getAttribute("aria-haspopup"), "menu");
  assert.equal(await page.locator("#root").getAttribute("aria-hidden"), "true");
  await assertFocusWithin(page, menu, "Open modal menu owns keyboard focus");
  await page.keyboard.press("Tab");
  await assertFocusWithin(page, menu, "Tab cannot enter hidden page behind the modal menu");
  await page.keyboard.press("Shift+Tab");
  await assertFocusWithin(page, menu, "Shift+Tab cannot enter hidden page behind the modal menu");
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  await assertFocus(page, trigger, "Modal menu Escape restores its original trigger");
  await trigger.press("Enter");
  await menu.waitFor();
  await assertFocusWithin(page, menu, "Reopened modal menu owns focus before the accessibility scan");
  assert.equal(await page.locator("#root").getAttribute("aria-hidden"), "true");
  return { ...state, ruleId: "aria-hidden-focus", target: "#root", status: "verified-focus-trapped-modal-menu",
    rootHidden: true, triggerOwnedPopup: true, tabContained: true, shiftTabContained: true,
    escapeRestored: true, reopenedContained: true };
}

async function verifyShell(page, { baseUrl, width, capture, diagnostics }) {
  await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("card-general-search").waitFor();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Langkau ke kandungan utama" });
  await assertFocus(page, skip, "First keyboard stop is the skip link");
  await page.keyboard.press("Enter");
  await assertFocus(page, page.locator("main#main-content"), "Skip link focuses main content");
  if (width >= 1024) {
    const toggle = page.getByTestId("button-toggle-sidebar");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await page.locator(".sqr-workspace[data-sidebar-collapsed='true']").waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await assertFocus(page, toggle, "Sidebar collapse retains keyboard focus");
    await capture("shell-collapsed", width);
    const search = page.getByTestId("nav-general-search");
    await search.focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("input-search").waitFor();
    assert.equal(await search.getAttribute("aria-current"), "page");
    assert.equal(await page.locator(".sqr-workspace").getAttribute("data-sidebar-collapsed"), "true");
    const group = page.getByTestId("nav-group-workspace");
    await group.focus();
    await page.keyboard.press("Enter");
    const workspaceFlyout = page.getByTestId("desktop-flyout-workspace");
    await workspaceFlyout.waitFor();
    await page.locator(".sqr-workspace[data-sidebar-collapsed='false']").waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Escape");
    await workspaceFlyout.waitFor({ state: "hidden" });
    await assertFocus(page, group, "Workspace navigation returns keyboard focus");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await page.locator(".sqr-workspace[data-sidebar-collapsed='true']").waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await page.keyboard.press("Enter");
    await page.locator(".sqr-workspace[data-sidebar-collapsed='false']").waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  } else {
    const trigger = page.getByTestId("button-open-mobile-nav");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const drawer = page.locator("#mobile-navigation-drawer");
    await drawer.waitFor();
    assert.equal(await trigger.getAttribute("aria-expanded"), "true");
    await assertDialogFits(drawer, "Mobile navigation drawer", diagnostics);
    await page.keyboard.press("Tab");
    assert.equal(await drawer.evaluate((element) => element.contains(document.activeElement)), true, "Mobile drawer contains keyboard focus");
    await capture("shell-mobile-navigation", width);
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    await assertFocus(page, trigger, "Mobile navigation returns keyboard focus");
    await trigger.press("Enter");
    await drawer.getByRole("button", { name: /^Search\b/ }).click();
    await drawer.waitFor({ state: "hidden" });
    await page.getByTestId("input-search").waitFor();
    assert.equal(new URL(page.url()).pathname, "/general-search");
    // Screenshots normally request reduced motion. Exercise one real animation
    // cycle as well, without changing application styles or animation settings.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    try {
      await trigger.focus();
      await trigger.press("Enter");
      await drawer.waitFor();
      const motion = await drawer.evaluate((element) => {
        const style = getComputedStyle(element);
        const milliseconds = (value) => value.split(",").map((part) => parseFloat(part) * (part.trim().endsWith("ms") ? 1 : 1000));
        return { label: "Mobile navigation normal motion", reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          animationDurationMs: milliseconds(style.animationDuration), transitionDurationMs: milliseconds(style.transitionDuration) };
      });
      diagnostics.push(motion);
      assert.equal(motion.reducedMotion, false, "Normal-motion check uses the actual no-preference media state");
      assert.ok([...motion.animationDurationMs, ...motion.transitionDurationMs].every((duration) => Number.isFinite(duration) && duration >= 180 && duration <= 220), "Normal navigation sheet motion follows the specified 180–220ms interval");
      await assertDialogFits(drawer, "Normal-motion mobile navigation settles within viewport", diagnostics);
      await assertFocusWithin(page, drawer, "Normal-motion mobile navigation receives focus");
      await capture("shell-mobile-normal-motion", width);
      await page.keyboard.press("Escape");
      await drawer.waitFor({ state: "hidden" });
      await assertFocus(page, trigger, "Normal-motion navigation restores launcher focus");
    } finally { await page.emulateMedia({ reducedMotion: "reduce" }); }
    await trigger.focus();
    await trigger.press("Enter");
    await drawer.waitFor();
    await page.setViewportSize({ width: 1024, height: 1000 });
    // Allow the real media-query event and Radix close animation to complete.
    await drawer.waitFor({ state: "hidden", timeout: 3_000 });
    await capture("shell-mobile-to-desktop", 1024);
    const resizeState = await page.evaluate(() => {
      const active = document.activeElement;
      const bounds = active?.getBoundingClientRect();
      return { label: "Mobile to desktop navigation resize", drawerOpen: Boolean(document.querySelector("#mobile-navigation-drawer[data-state='open']")),
        focusedTestId: active?.getAttribute("data-testid") ?? null, focusVisible: Boolean(bounds && bounds.width > 0 && bounds.height > 0),
        bodyPointerEvents: getComputedStyle(document.body).pointerEvents };
    });
    diagnostics.push(resizeState);
    assert.equal(await drawer.isVisible(), false, "Mobile navigation closes when desktop navigation becomes available");
    await assertFocus(page, page.getByTestId("button-toggle-sidebar"), "Resize restores focus to the visible desktop navigation control");
    assert.notEqual(resizeState.bodyPointerEvents, "none", "Resizing out of mobile navigation releases modal pointer lock");
  }
}

async function verifyPopulatedSearch(page, { baseUrl, width, capture, diagnostics }) {
  await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
  await page.goto(`${baseUrl}/general-search`, { waitUntil: "domcontentloaded" });
  const query = "Synthetic Card Customer";
  await page.getByTestId("input-search").fill(query);
  const searchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/search/global" && url.searchParams.get("q") === query;
  });
  await page.getByTestId("button-search").click();
  const response = await searchResponse;
  assert.equal(response.status(), 200, "Real seeded General Search succeeds");
  const payload = await response.json();
  assert.ok(payload.total >= 2, "Search returns the two real imported fixture rows");
  assert.ok(payload.results.some((row) => row["Account Number"] === "ACC-CARD-FIXTURE"), "Search returns the seeded account");
  const view = page.getByTestId("button-view-0");
  await view.waitFor();
  await capture("general-search-populated", width);
  await view.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByTestId("general-search-record-dialog");
  await dialog.waitFor();
  await dialog.getByRole("heading", { name: "Record Details", exact: true }).waitFor();
  await dialog.getByText("ACC-CARD-FIXTURE", { exact: true }).first().waitFor();
  await assertDialogFits(dialog, "Search record detail", diagnostics);
  assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true, "Search dialog receives keyboard focus");
  await capture("general-search-details", width);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await assertFocus(page, view, "Search detail returns focus to its initiating record");
  assert.equal(await page.getByTestId("input-search").inputValue(), query, "Closing detail preserves query");
}

async function verifyCollection(page, { baseUrl, width, capture, diagnostics, billingFixture }) {
  await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
  await page.goto(`${baseUrl}/collection/records`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("collection-records-page").waitFor();
  if (billingFixture) await scopeOriginalCollectionRecords(page, width);
  await page.getByText(/^Showing .* of 59 records$/).waitFor();
  async function verifyRecordCancellation(origin, action, open) {
    for (const dismissal of ["cancel", "escape"]) {
      await open();
      const dialog = action === "Edit"
        ? page.getByRole("dialog", { name: "Edit Collection Record", exact: true })
        : page.getByRole("alertdialog", { name: "Padam Rekod", exact: true });
      await dialog.waitFor();
      await assertFocusWithin(page, dialog, `Collection ${action} receives keyboard focus`);
      await assertDialogFits(dialog, `Collection ${action} dialog`, diagnostics);
      if (dismissal === "cancel") {
        await capture(`collection-${action.toLowerCase()}-dialog`, width);
        await dialog.getByRole("button", { name: action === "Edit" ? "Cancel" : "Batal", exact: true }).click();
      } else await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await assertFocus(page, origin, `Collection ${action} ${dismissal} restores initiating control`);
    }
  }
  if (width >= 768) {
    const navigation = page.getByRole("navigation", { name: "Collection sections", exact: true });
    await navigation.waitFor();
    const active = navigation.getByRole("button", { name: "View Rekod Collection", exact: true });
    assert.equal(await active.getAttribute("aria-current"), "page");
    const record = page.locator("tbody tr[aria-label]").first();
    await record.scrollIntoViewIfNeeded();
    await capture("collection-records-table", width);
    const origin = record.getByRole("button", { name: "Actions for record 1", exact: true });
    for (const action of ["Edit", "Delete"]) {
      await verifyRecordCancellation(origin, action, async () => {
        await origin.scrollIntoViewIfNeeded();
        await origin.focus();
        await page.keyboard.press("Enter");
        await page.getByRole("menuitem", { name: action, exact: true }).click();
      });
    }
    return;
  }
  const sectionTrigger = page.getByTestId("button-open-collection-sections");
  await sectionTrigger.focus();
  await page.keyboard.press("Enter");
  const sectionDrawer = page.getByRole("dialog", { name: "Collection sections", exact: true });
  await sectionDrawer.waitFor();
  await assertDialogFits(sectionDrawer, "Collection section drawer", diagnostics);
  await capture("collection-sections", width);
  await page.keyboard.press("Escape");
  await sectionDrawer.waitFor({ state: "hidden" });
  await assertFocus(page, sectionTrigger, "Collection sections restore launcher focus");
  const filterTrigger = page.getByRole("button", { name: /^Search & Filters(?: \d+)?$/ });
  await assertButtonContentsFit(filterTrigger, "Collection filter launcher", diagnostics);
  await filterTrigger.focus();
  await page.keyboard.press("Enter");
  const filters = page.getByRole("dialog", { name: "Search & Filters", exact: true });
  await filters.waitFor();
  await filters.locator("#collection-records-search-mobile").waitFor();
  await assertDialogFits(filters, "Collection filter sheet", diagnostics);
  await capture("collection-filters", width);
  await page.keyboard.press("Escape");
  await filters.waitFor({ state: "hidden" });
  await assertFocus(page, filterTrigger, "Collection filters restore launcher focus");
  const record = page.locator("article[role='group']").first();
  await record.waitFor();
  const details = record.locator("details");
  assert.equal(await details.evaluate((element) => element.open), false, "Collection metadata starts collapsed");
  await details.locator("summary").focus();
  await page.keyboard.press("Enter");
  assert.equal(await details.evaluate((element) => element.open), true, "Keyboard opens Collection metadata");
  await details.getByText("IC Number", { exact: true }).waitFor();
  await capture("collection-record-details", width);
  await details.locator("summary").press("Enter");
  assert.equal(await details.evaluate((element) => element.open), false, "Keyboard closes Collection metadata");
  const actions = record.getByRole("button", { name: "Actions for record 1", exact: true });
  await actions.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await menu.getByRole("menuitem", { name: "Edit", exact: true }).waitFor();
  await menu.getByRole("menuitem", { name: "Delete", exact: true }).waitFor();
  await capture("collection-record-actions", width);
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  await assertFocus(page, actions, "Collection actions restore focus without mutating a record");
  for (const action of ["Edit", "Delete"]) {
    await verifyRecordCancellation(actions, action, async () => {
      await actions.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("menuitem", { name: action, exact: true }).click();
    });
  }
}

async function selectFixtureNickname(page, triggerId) {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("button", { name: "Fixture Collector", exact: true }).click();
}

async function scopeOriginalCollectionRecords(page, width) {
  // The opt-in August supplement must not weaken the original September checks.
  let step = "open records filter sheet";
  try {
    if (width < 768) await page.getByRole("button", { name: /^Search & Filters(?: \d+)?$/ }).click();
    step = "select original synthetic nickname";
    await selectFixtureNickname(page, width < 768 ? "collection-records-nickname-filter-mobile" : "collection-records-nickname-filter");
    if (width < 768) {
      step = "close records filter sheet";
      const sheet = page.getByRole("dialog", { name: "Search & Filters", exact: true });
      // Selecting closes the nested nickname popover asynchronously. Use the
      // sheet's own close control here; its Escape path is verified separately.
      await sheet.getByRole("button", { name: "Close", exact: true }).click();
      await sheet.waitFor({ state: "hidden" });
    }
    step = "wait original 59 records";
    await page.getByText(/^Showing .* of 59 records$/).waitFor();
  } catch (error) {
    error.redesignStep = step;
    throw error;
  }
}

async function prepareCollectionSave(page) {
  await selectFixtureNickname(page, "save-collection-superuser-nickname");
  await page.locator("#save-collection-customer-name").waitFor();
  await page.getByLabel("Customer Name", { exact: true }).waitFor();
  // Baseline is the real full form; do not manufacture its DOM or submit data.
}

async function prepareCollectionSummary(page, width) {
  const mobile = width < 768;
  if (mobile) await page.getByRole("button", { name: /^Summary Filters/ }).click();
  await page.locator("#collection-summary-year-filter").selectOption("2026");
  await page.locator("#collection-summary-nickname-filter").click();
  const option = page.getByRole("checkbox", { name: "Fixture Collector", exact: true });
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/collection/summary" && url.searchParams.get("year") === "2026"
      && url.searchParams.get("nicknames") === "Fixture Collector";
  });
  await option.check();
  const response = await responsePromise;
  assert.equal(response.status(), 200, "Real nickname-filtered yearly summary succeeds");
  const payload = await response.json();
  assert.equal(payload.summary.find((month) => month.month === 9)?.totalRecords, 59, "Yearly summary contains all synthetic September records");
  await page.keyboard.press("Escape");
  if (mobile) await page.getByRole("dialog", { name: "Collection Summary Filters", exact: true }).getByRole("button", { name: "Done", exact: true }).click();
  const september = page.getByRole("table", { name: "Monthly collection totals", exact: true })
    .getByRole("row").filter({ has: page.getByRole("button", { name: "September", exact: true }) });
  await september.getByRole("cell", { name: "59", exact: true }).waitFor();
}

async function prepareCollectionMonthly(page) {
  await selectFixtureNickname(page, "collection-monthly-comparison-nickname");
  await page.locator("#collection-monthly-comparison-start-month").fill("2026-08");
  await page.locator("#collection-monthly-comparison-end-month").fill("2026-09");
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/collection/monthly-comparison" && url.searchParams.get("nickname") === "Fixture Collector"
      && url.searchParams.get("startMonth") === "2026-08" && url.searchParams.get("endMonth") === "2026-09";
  });
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200, "Real bounded monthly comparison succeeds");
  const payload = await response.json();
  assert.equal(payload.nickname, "Fixture Collector");
  assert.equal(payload.months.find((month) => month.month === "2026-09")?.recordCount, 59, "Monthly comparison contains all synthetic September records");
  await page.getByText("2 month(s) loaded", { exact: true }).waitFor();
}

async function preparePopulatedBilling(page, fixture) {
  const targetSelect = page.locator("#billing-saved-target-select");
  await targetSelect.selectOption(fixture.targetId);
  assert.equal(await targetSelect.inputValue(), fixture.targetId, "Billing UI selects the newly created synthetic target");
  await page.getByRole("heading", { name: fixture.targetName, exact: true }).waitFor();
  const asOf = page.locator("#billing-system-as-of");
  await asOf.fill(fixture.to);
  assert.equal(await asOf.inputValue(), "2026-08-31");
  const tableA = page.getByRole("table", { name: "Table A System Billing Principal result", exact: true });
  const tableB = page.getByRole("table", { name: "Table B Client Billing Principal result", exact: true });
  await tableA.waitFor();
  await tableB.waitFor();
  const allA = tableA.getByRole("row").filter({ has: page.getByRole("cell", { name: "ALL", exact: true }) });
  const allB = tableB.getByRole("row").filter({ has: page.getByRole("cell", { name: "ALL", exact: true }) });
  const numberAt = async (row, index) => Number((await row.getByRole("cell").nth(index).innerText()).replace(/[^\d.-]/g, ""));
  assert.equal(await numberAt(allA, 1), 10500, "Table A displays the two-source TT OSP baseline");
  assert.equal(await numberAt(allA, 5), 10000, "Table A displays actual system closed OSP");
  assert.equal(await numberAt(allA, 6), 4, "Table A counts four closed synthetic accounts");
  assert.equal(await numberAt(allB, 1), 10500, "Table B retains the same immutable TT OSP");
  assert.equal(await numberAt(allB, 5), 2100, "Table B shows this synthetic account's saved private result");
  assert.equal(await page.getByRole("button", { name: "Save Client Result", exact: true }).isDisabled(), true, "Populated Billing capture has no unsaved private edits");
  await page.locator("#billing-calendar-month").fill("2026-08");
  await page.locator("#billing-calendar-aging").selectOption("ALL");
  const calendar = page.getByRole("region", { name: "System calendar daily movement", exact: true });
  await calendar.waitFor();
  assert.equal(await calendar.locator("[data-testid^='billing-calendar-day-']").count(), 31, "Billing calendar retains every configured August day");
  for (const [day, amount] of [[20, "3,000.00"], [21, "7,000.00"]]) {
    const label = await page.getByTestId(`billing-calendar-day-2026-08-${day}`).getAttribute("aria-label");
    assert.ok(label.includes("2 accounts") && label.includes(amount), `Billing August ${day} shows actual daily closed movement`);
  }
}

async function captureBillingSections(page, width, capture) {
  for (const [id, selector] of [["billing-table-a", "#billing-table-a-heading"], ["billing-table-b", "#billing-table-b-heading"], ["billing-calendar-populated", "[data-testid='billing-calendar-day-2026-08-20']"]]) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await capture(id, width);
  }
}

async function preparePopulatedDaily(page, fixture) {
  let dailyStep = "set actual year/month controls";
  try {
  for (const [field, value] of [["year", fixture.year], ["month", fixture.month]]) {
    const control = page.locator(`#collection-daily-${field}-input`);
    await control.fill(String(value));
    await control.press("Enter");
  }
  dailyStep = "choose actual synthetic nickname";
  const trigger = page.getByTestId("collection-daily-user-trigger");
  await trigger.click();
  const popover = page.getByTestId("collection-daily-user-popover");
  const clear = popover.getByRole("button", { name: "Clear", exact: true });
  if (await clear.isEnabled()) await clear.click();
  await popover.getByRole("checkbox", { name: fixture.nickname, exact: true }).check();
  await page.keyboard.press("Escape");
  await popover.waitFor({ state: "hidden" });
  assert.equal((await trigger.innerText()).trim(), fixture.nickname, "Daily capture is scoped to the actual selected synthetic nickname");
  // Reselecting the default nickname can correctly hit the view cache. Use the
  // real Refresh action to prove a fresh response for the selected UI scope.
  dailyStep = "refresh selected Daily scope through actual UI";
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/collection/daily/overview" && url.searchParams.get("year") === "2026"
      && url.searchParams.get("month") === "8" && url.searchParams.get("usernames")?.toLowerCase() === fixture.nickname.toLowerCase();
  });
  await page.getByTestId("collection-daily-refresh").click();
  const response = await responsePromise;
  assert.equal(response.status(), 200, "Actual Daily controls load the selected August nickname");
  const payload = await response.json();
  assert.equal(Number(payload.summary.monthlyTarget), 10000);
  assert.equal(Number(payload.summary.collectedToDate), 2100);
  assert.equal(await page.locator("#collection-daily-year-input").inputValue(), "2026");
  assert.equal(await page.locator("#collection-daily-month-input").inputValue(), "8");
  dailyStep = "verify rendered Daily summary and calendar";
  const summaryCard = page.locator(".ops-section-card").filter({ has: page.getByRole("heading", { name: "Daily Performance Summary", exact: true }) });
  // Supporting indicators can repeat the target amount; assert primary KPIs.
  const summary = summaryCard.locator(".ops-summary-strip").first();
  await summary.getByText(/10,000\.00/).waitFor();
  await summary.getByText(/2,100\.00/).waitFor();
  await page.getByTestId("collection-daily-day-20").waitFor();
  } catch (error) {
    error.redesignStep = dailyStep;
    throw error;
  }
}

async function verifyCollectionExport(page, { baseUrl, width, capture, billingFixture }) {
  await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
  await page.goto(`${baseUrl}/collection/records`, { waitUntil: "domcontentloaded" });
  if (billingFixture) await scopeOriginalCollectionRecords(page, width);
  await page.getByText(/^Showing .* of 59 records$/).waitFor();
  const trigger = page.getByRole("button", { name: "Export", exact: true });
  for (const format of ["Excel", "PDF"]) {
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await menu.getByRole("menuitem", { name: `Export ${format}`, exact: true }).waitFor();
    await capture(`collection-export-${format.toLowerCase()}-menu`, width);
    const downloadPromise = page.waitForEvent("download");
    await menu.getByRole("menuitem", { name: `Export ${format}`, exact: true }).click();
    const download = await downloadPromise;
    assert.equal(await download.failure(), null, `Collection ${format} download completes`);
    assert.match(download.suggestedFilename(), format === "Excel" ? /^Collection-Report-\d{4}-\d{2}-\d{2}\.xlsx$/ : /^Collection-Report-\d{4}-\d{2}-\d{2}\.pdf$/);
    const stream = await download.createReadStream();
    assert.ok(stream, `Collection ${format} download has a body`);
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
      assert.ok(size <= 10 * 1024 * 1024, "Synthetic export is bounded to 10MB");
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    assert.ok(bytes.length > 100, `Collection ${format} is not an empty export`);
    assert.equal(bytes.subarray(0, format === "Excel" ? 2 : 5).toString("ascii"), format === "Excel" ? "PK" : "%PDF-", "Downloaded format signature matches requested menu action");
    await download.delete();
    await menu.waitFor({ state: "hidden" });
    await trigger.waitFor();
    await assertFocus(page, trigger, `Collection ${format} export returns focus to Export`);
  }
}

async function verifyDaily(page, { baseUrl, width, billingFixture, captureSection }) {
  assert.ok(billingFixture, "Daily disclosure workflow requires the opt-in synthetic Billing fixture");
  await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
  await page.goto(`${baseUrl}/collection/daily`, { waitUntil: "domcontentloaded" });
  await preparePopulatedDaily(page, billingFixture);
  const summaryCard = page.locator(".ops-section-card").filter({ has: page.getByRole("heading", { name: "Daily Performance Summary", exact: true }) });
  const primaryAmounts = summaryCard.locator(".ops-summary-strip").first().locator(".ops-metric-value");
  assert.equal(await primaryAmounts.count(), 4, "Daily primary summary retains all four amounts");
  async function assertAmountsFit(amounts) {
  for (const amount of await amounts.all()) {
    const layout = await amount.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const lineTops = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => Math.round(rect.top));
      return { lineCount: new Set(lineTops).size, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    assert.equal(layout.lineCount, 1, "Seeded Daily currency amount remains on one readable line");
    assert.ok(layout.scrollWidth <= layout.clientWidth + 1, "Seeded Daily currency amount fits its metric without horizontal scrolling");
  }
  }
  await assertAmountsFit(primaryAmounts);
  await captureSection("daily-summary-closed", summaryCard, width);
  const attention = page.getByRole("region", { name: "Daily calendar attention summary", exact: true });
  await attention.waitFor();
  assert.equal(await attention.evaluate((element) => element.closest("details") === null), true, "Daily attention warning stays outside optional disclosures");
  await captureSection("daily-calendar-attention", attention, width);
  for (const [id, testId] of [["daily-calendar-filters", "collection-daily-calendar-filter"], ["daily-calendar-view-modes", "collection-daily-calendar-view-mode"]]) {
    const control = page.getByTestId(testId);
    assert.equal(await control.evaluate((element) => element.closest("details") === null), true, "Daily filter and display controls remain directly available");
    await captureSection(id, control, width);
  }
  const disclosureCases = [
    { id: "daily-supporting-expanded", label: "Supporting Indicators", ready: () => page.getByText("Base Daily Target", { exact: true }) },
    { id: "daily-legend-expanded", label: "Calendar legend and status codes", ready: () => page.getByTestId("collection-daily-legend") },
    { id: "daily-breakdown-expanded", label: "Monthly status and collection breakdown", ready: () => page.getByRole("region", { name: "Monthly status and collection breakdown", exact: true }) },
    { id: "daily-bulk-expanded", label: "Bulk daily status update · 0 selected", ready: () => page.getByRole("combobox", { name: "Bulk daily status", exact: true }) },
  ];
  for (const item of disclosureCases) {
    const toggle = page.locator("summary").filter({ hasText: item.label });
    const disclosure = page.locator("details.collection-daily-disclosure").filter({ has: toggle });
    assert.equal(await disclosure.evaluate((element) => element.open), false, `${item.label} starts collapsed`);
    await toggle.focus();
    await toggle.press("Enter");
    assert.equal(await disclosure.evaluate((element) => element.open), true, `${item.label} opens through the keyboard`);
    await item.ready().waitFor();
    if (item.id === "daily-supporting-expanded") {
      for (const label of ["Expected Progress", "Progress Variance", "Working Days", "Elapsed Working Days", "Remaining Working Days", "Completed Days", "Incomplete Days", "No Collection Days"]) {
        await disclosure.getByText(label, { exact: true }).waitFor();
      }
      await assertAmountsFit(disclosure.locator(".ops-metric-value"));
    }
    if (item.id === "daily-legend-expanded") {
      for (const code of ["AL", "MC", "OFF"]) await disclosure.getByText(code, { exact: true }).waitFor();
    }
    if (item.id === "daily-breakdown-expanded") {
      await disclosure.getByText("31 hari", { exact: true }).waitFor();
      await disclosure.getByText("Working days", { exact: true }).waitFor();
      await disclosure.getByText("Holiday / Leave", { exact: true }).waitFor();
    }
    if (item.id === "daily-bulk-expanded") {
      await disclosure.locator("#collection-daily-bulk-leave-type").waitFor();
      await disclosure.locator("#collection-daily-bulk-note").waitFor();
      assert.equal(await disclosure.getByRole("button", { name: "Apply to selected days", exact: true }).isDisabled(), true, "Bulk Apply remains disabled without selected days");
    }
    await captureSection(item.id, disclosure, width);
    await toggle.focus();
    await toggle.press("Enter");
    assert.equal(await disclosure.evaluate((element) => element.open), false, `${item.label} closes through the keyboard`);
    await assertFocus(page, toggle, `${item.label} retains keyboard focus`);
  }
  const day = page.getByTestId("collection-daily-day-20");
  const dayCard = page.locator(width < 768 ? ".collection-daily-mobile-day-card" : ".collection-daily-desktop-day").filter({ has: day });
  await captureSection("daily-populated-day-20", dayCard, width);
  assert.equal(await page.getByRole("button", { name: "Save Changed Days", exact: true }).isDisabled(), true, "Read-only disclosures do not create calendar changes");
  await attention.getByText("0 belum save", { exact: true }).waitFor();
}

async function verifySaved(page, { baseUrl, width, capture, diagnostics }) {
  await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
  await page.goto(`${baseUrl}/saved`, { waitUntil: "domcontentloaded" });
  const source = "fixture-card-source-a";
  const trigger = page.getByTestId(`button-import-actions-${source}`);
  await trigger.waitFor();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  for (const action of ["analysis", "inspect", "rename", "delete"]) await menu.getByTestId(`button-${action}-${source}`).waitFor();
  await capture("saved-file-actions", width);
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  await assertFocus(page, trigger, "Saved actions restore launcher focus");
  await trigger.press("Enter");
  await page.getByTestId(`button-inspect-${source}`).click();
  const drawer = page.getByTestId("saved-import-detail-drawer");
  await drawer.waitFor();
  await drawer.getByRole("heading", { name: "Synthetic Saved a.xlsx", exact: true }).waitFor();
  await assertDialogFits(drawer, "Saved file detail drawer", diagnostics);
  await assertFocusWithin(page, drawer, "Saved Details moves keyboard focus into its drawer");
  await capture("saved-file-details", width);
  // Exercise the nested confirmation without confirming any destructive action.
  const drawerDelete = drawer.getByRole("button", { name: "Delete", exact: true });
  await drawerDelete.focus();
  await page.keyboard.press("Enter");
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete Data?", exact: true });
  await deleteDialog.waitFor();
  await assertFocusWithin(page, deleteDialog, "Nested Saved Delete traps focus in confirmation");
  await assertDialogFits(deleteDialog, "Nested Saved delete confirmation", diagnostics);
  await capture("saved-nested-delete-confirmation", width);
  await deleteDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await deleteDialog.waitFor({ state: "hidden" });
  await assertFocus(page, drawerDelete, "Cancelling nested Delete restores drawer Delete focus");
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "hidden" });
  await assertFocus(page, trigger, "Closing Saved Details restores original More actions focus");
  for (const action of ["rename", "delete"]) {
    for (const dismissal of ["cancel", "escape"]) {
      await trigger.press("Enter");
      await page.getByTestId(`button-${action}-${source}`).click();
      const dialog = action === "rename"
        ? page.getByRole("dialog", { name: "Rename Import", exact: true })
        : deleteDialog;
      await dialog.waitFor();
      await assertFocusWithin(page, dialog, `Saved ${action} receives keyboard focus`);
      await assertDialogFits(dialog, `Saved ${action} confirmation`, diagnostics);
      if (action === "rename") assert.equal(await dialog.getByTestId("input-rename").inputValue(), "Synthetic Saved a.xlsx", "Rename opens with actual stored name");
      if (dismissal === "cancel") {
        await capture(`saved-${action}-dialog`, width);
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      } else await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await assertFocus(page, trigger, `Saved ${action} ${dismissal} restores More actions focus`);
    }
  }
  await page.getByTestId(`card-import-${source}`).getByText("Synthetic Saved a.xlsx", { exact: true }).first().waitFor();
  await page.getByTestId(`button-view-${source}`).click();
  await page.getByRole("region", { name: "Viewer data columns" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/viewer", "Saved primary action opens actual Viewer");
  await capture("saved-to-viewer", width);
}

async function verifyViewer(page, { baseUrl, width, capture, diagnostics }) {
  await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
  await page.goto(`${baseUrl}/saved`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("button-view-fixture-card-source-a").click();
  const data = page.getByRole("region", { name: "Viewer data columns", exact: true });
  await data.getByText("ACC-CARD-FIXTURE", { exact: true }).waitFor();
  const columnsTrigger = page.getByTestId("button-column-selector");
  await columnsTrigger.focus();
  await page.keyboard.press("Enter");
  const columns = page.getByRole("dialog");
  await columns.getByTestId("button-reset-columns").waitFor();
  await assertDialogFits(columns, "Viewer columns selector", diagnostics);
  const cardColumn = columns.getByTestId("checkbox-column-Card Number");
  await cardColumn.waitFor();
  const wasChecked = await cardColumn.isChecked();
  await cardColumn.setChecked(!wasChecked);
  assert.equal(await cardColumn.isChecked(), !wasChecked, "Viewer columns control changes actual selection");
  await cardColumn.setChecked(wasChecked);
  await capture("viewer-columns", width);
  await page.keyboard.press("Escape");
  await columns.waitFor({ state: "hidden" });
  await assertFocus(page, columnsTrigger, "Viewer columns restores launcher focus");
  const filtersTrigger = page.getByTestId("button-toggle-filters");
  await filtersTrigger.focus();
  await page.keyboard.press("Enter");
  await page.getByTestId("button-add-filter").waitFor();
  if (width < 768) {
    const filters = page.getByRole("dialog", { name: "Column Filters", exact: true });
    await assertFocusWithin(page, filters, "Viewer mobile filters receive keyboard focus");
    await assertDialogFits(filters, "Viewer mobile filter sheet", diagnostics);
  }
  await page.getByTestId("button-add-filter").click();
  await page.getByTestId("input-filter-value-0").waitFor();
  await capture("viewer-filters", width);
  await page.getByTestId("button-remove-filter-0").click();
  await page.getByTestId("input-filter-value-0").waitFor({ state: "hidden" });
  if (width < 768) {
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Column Filters", exact: true }).waitFor({ state: "hidden" });
    await assertFocus(page, filtersTrigger, "Viewer mobile filters restore launcher focus");
  } else await filtersTrigger.click();
  assert.equal(await filtersTrigger.getAttribute("aria-expanded"), "false");
  const more = page.getByTestId("button-viewer-more-actions");
  await more.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menu").getByTestId("button-clear-all").waitFor();
  await capture("viewer-more-actions", width);
  await page.keyboard.press("Escape");
  await page.getByRole("menu").waitFor({ state: "hidden" });
  await assertFocus(page, more, "Viewer More menu restores launcher focus without clearing data");
  await data.getByText("ACC-CARD-FIXTURE", { exact: true }).waitFor();
  if (width < 768) {
    const details = data.locator("article details").first();
    await details.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await details.evaluate((element) => element.open), true, "Viewer additional fields remain keyboard accessible");
    await capture("viewer-extra-fields", width);
    await details.locator("summary").press("Enter");
    assert.equal(await details.evaluate((element) => element.open), false);
  }
  const footer = page.getByRole("navigation", { name: "Dataset pagination", exact: true });
  await footer.waitFor();
  const footerPosition = await footer.evaluate((element) => getComputedStyle(element).position);
  assert.notEqual(footerPosition, "fixed", "Viewer pagination does not float over rows or search");
  const dataBounds = await data.boundingBox();
  const footerBounds = await footer.boundingBox();
  assert.ok(dataBounds && footerBounds && footerBounds.y >= dataBounds.y + dataBounds.height - 1, "Viewer pagination follows the data region without overlap");
  await page.getByTestId("input-search-viewer").scrollIntoViewIfNeeded();
  await capture("viewer-verified-data", width);
}

async function selectRolesSettings(page, width) {
  let settingsStep = "resolve actual category metadata";
  try {
  // Category IDs are generated by this fresh database; never guess a route ID.
  // Read metadata only. Selection still happens through actual Settings UI.
  const category = await page.evaluate(async () => {
    const response = await fetch("/api/settings", { credentials: "include" });
    if (response.status !== 200) return null;
    const payload = await response.json();
    const match = payload.categories?.find((entry) => entry.name === "Roles & Permissions");
    return match ? { id: match.id, name: match.name } : null;
  });
  assert.ok(category?.id, "Actual Settings API includes a role-permission category");
  settingsStep = "open Settings section navigation";
  if (width < 768) await page.getByTestId("button-open-settings-sections").click();
  const navigation = page.getByRole("navigation", { name: "Settings Navigation", exact: true });
  const item = navigation.getByRole("button", { name: /^Roles & Permissions(?:\s|$)/ });
  settingsStep = "click actual Roles & Permissions category";
  await item.click();
  settingsStep = "wait for selected category URL";
  await page.waitForURL((url) => url.pathname === "/settings" && url.searchParams.get("section") === category.id);
  settingsStep = "wait for role-permission manager content";
  await page.getByRole("region", { name: "Role and permission manager", exact: true }).waitFor();
  if (width < 768) {
    await page.getByRole("dialog", { name: "Settings Menu", exact: true }).waitFor({ state: "hidden" });
    await assertFocus(page, page.getByTestId("button-open-settings-sections"), "Settings category selection restores mobile launcher focus");
  } else assert.equal(await item.getAttribute("aria-current"), "page", "Selected Settings category is identified in navigation");
  } catch (error) {
    error.redesignStep = settingsStep;
    error.redesignSettingsState = await page.evaluate(() => ({
      path: location.pathname,
      headings: [...document.querySelectorAll("main h1, main h2")].map((node) => node.textContent?.trim()),
      selectedSections: [...document.querySelectorAll("nav[aria-label='Settings Navigation'] [aria-current='page']")].map((node) => node.textContent?.trim()),
      roleManagerPresent: Boolean(document.querySelector("section[aria-label='Role and permission manager']")),
    })).catch(() => null);
    throw error;
  }
}

async function verifySettings(page, { baseUrl, width, capture, captureSection, diagnostics }) {
  let settingsStep = "open Settings route";
  try {
  await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  if (width < 768) {
    const launcher = page.getByTestId("button-open-settings-sections");
    await launcher.focus();
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "Settings Menu", exact: true });
    await sheet.waitFor();
    await assertFocusWithin(page, sheet, "Settings section menu receives keyboard focus");
    await assertDialogFits(sheet, "Settings section menu", diagnostics);
    await capture("settings-navigation", width);
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "hidden" });
    await assertFocus(page, launcher, "Settings section menu Escape restores launcher focus");
  } else await page.getByRole("navigation", { name: "Settings Navigation", exact: true }).waitFor();
  await selectRolesSettings(page, width);
  const manager = page.getByRole("region", { name: "Role and permission manager", exact: true });
  settingsStep = "inspect collapsed Role Comparison";
  // `has` is resolved relative to each details element, not from the page root.
  const comparison = manager.locator("details").filter({ has: page.locator("summary").filter({ hasText: "Role Comparison" }) });
  const comparisonToggle = comparison.locator("summary");
  assert.equal(await comparison.evaluate((element) => element.open), false, "Role Comparison starts collapsed so role controls remain primary");
  for (const role of ["Admin", "User", "Manager"]) {
    settingsStep = `select ${role} permission tab`;
    const tab = manager.getByRole("tab", { name: new RegExp(`^${role}\\b`) });
    await tab.focus();
    await page.keyboard.press("Enter");
    assert.equal(await tab.getAttribute("aria-selected"), "true", `Role ${role} tab selects its actual controls`);
    await manager.getByRole("tabpanel").getByText(`${role} Permissions`, { exact: true }).waitFor();
  }
  settingsStep = "open Role Comparison through keyboard";
  await comparisonToggle.focus();
  await comparisonToggle.press("Enter");
  assert.equal(await comparison.evaluate((element) => element.open), true, "Role Comparison opens through the keyboard");
  const comparisonTable = comparison.getByRole("table", { name: "Role permission comparison by module", exact: true });
  await comparisonTable.waitFor();
  for (const role of ["Manager", "Admin", "User"]) {
    await comparisonTable.getByRole("columnheader", { name: role, exact: true }).waitFor();
  }
  const totalComparisonRows = await comparisonTable.getByRole("rowheader").count();
  assert.ok(totalComparisonRows > 0, "Role Comparison contains actual permission modules");
  await captureSection("settings-role-comparison-expanded", comparison, width);
  settingsStep = "filter and restore Role Comparison";
  const search = manager.getByRole("textbox", { name: "Search permission or module", exact: true });
  await search.fill("collection");
  await manager.getByRole("tabpanel").getByRole("region", { name: "Collection permission group", exact: true }).waitFor();
  const filteredComparisonRows = await comparisonTable.getByRole("rowheader").count();
  assert.ok(filteredComparisonRows > 0 && filteredComparisonRows < totalComparisonRows, "Permission search filters Role Comparison without removing all Collection modules");
  await captureSection("settings-role-comparison-filtered", comparison, width);
  await capture("settings-role-search", width);
  await search.fill("");
  assert.equal(await comparisonTable.getByRole("rowheader").count(), totalComparisonRows, "Clearing permission search restores all comparison modules");
  await comparisonToggle.focus();
  settingsStep = "close Role Comparison and retain focus";
  await comparisonToggle.press("Enter");
  assert.equal(await comparison.evaluate((element) => element.open), false, "Role Comparison closes through the keyboard");
  await assertFocus(page, comparisonToggle, "Role Comparison retains keyboard focus");
  await page.getByText("No unsaved changes", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Save Changes", exact: true }).isDisabled(), true, "Read-only permission inspection does not create unsaved changes");
  await capture("settings-roles-verified", width);
  } catch (error) {
    error.redesignStep ??= settingsStep;
    throw error;
  }
}

async function verifySettingsDeepLinks(page, { baseUrl, width, capture, diagnostics }) {
  let deepLinkStep = "set viewport";
  try {
  await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
  for (const [section, heading, ready] of [
    ["backup-restore", "Backup & Restore", () => page.getByTestId("button-refresh-backups")],
    // This existing CardTitle renders a div, not a heading. The page h1 is
    // asserted independently below; do not invent semantics in the verifier.
    ["account-management", "Account Management", () => page.getByText("User Account Management", { exact: true })],
  ]) {
    // Arm the real bootstrap response before full navigation. Synthetic sidebar
    // entries can exist before server categories; both must finish before the
    // requested route is considered applied. No request interception or writes.
    deepLinkStep = `${section}: actual bootstrap`;
    const settingsResponse = page.waitForResponse((response) => response.request().method() === "GET"
      && new URL(response.url()).pathname === "/api/settings");
    await page.goto(`${baseUrl}/settings?section=${section}`, { waitUntil: "domcontentloaded" });
    const response = await settingsResponse;
    assert.equal(response.status(), 200, "Settings deep link waits for actual category bootstrap");
    const payload = await response.json();
    await response.finished();
    deepLinkStep = `${section}: destination ready`;
    await ready().waitFor();
    const title = page.getByRole("heading", { level: 1, name: heading, exact: true });
    await title.waitFor();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(new URL(page.url()).searchParams.get("section"), section, "Bootstrap retains the requested special Settings section");
    await capture(`settings-deep-link-${section}`, width);
    assert.equal(new URL(page.url()).searchParams.get("section"), section, "Deep link remains stable through rendered inspection");

    for (const categoryName of ["General", "Security"]) {
      deepLinkStep = `${section}: navigate ${categoryName}`;
      const category = payload.categories?.find((entry) => entry.name === categoryName);
      assert.ok(category?.id, `Actual Settings API includes ${categoryName}`);
      if (width < 768) await page.getByTestId("button-open-settings-sections").click();
      const navigation = page.getByRole("navigation", { name: "Settings Navigation", exact: true });
      const item = navigation.getByRole("button", { name: new RegExp(`^${categoryName}(?:\\s|$)`) });
      await item.click();
      await page.waitForURL((url) => url.pathname === "/settings" && url.searchParams.get("section") === category.id);
      await page.getByRole("heading", { level: 1, name: categoryName, exact: true }).waitFor();
      if (categoryName === "Security") {
        assert.equal(await page.getByTestId("two-factor-settings").count(), 0,
          "Administrative Security contains no duplicate personal 2FA form");
        assert.equal(await page.locator("#my-account-new-password").count(), 0,
          "Administrative Security contains no duplicate personal password form");
      }
      if (width < 768) {
        await page.getByRole("dialog", { name: "Settings Menu", exact: true }).waitFor({ state: "hidden" });
        await assertFocus(page, page.getByTestId("button-open-settings-sections"), "Deep-link category change restores mobile launcher focus");
      } else assert.equal(await item.getAttribute("aria-current"), "page");
      await capture(`settings-after-${section}-${categoryName.toLowerCase()}`, width);
      assert.equal(new URL(page.url()).searchParams.get("section"), category.id, "Applied deep link does not pin later category navigation");
      await page.getByText("No unsaved changes", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Save Changes", exact: true }).isDisabled(), true,
        "Read-only deep-link inspection does not create unsaved settings");
    }
    diagnostics.push({ label: "Settings special-section bootstrap and subsequent navigation", section,
      realBootstrap: true, stableDeepLink: true, generalAndSecuritySelectable: true, mutationPerformed: false });
  }
  } catch (error) {
    error.redesignStep ??= deepLinkStep;
    throw error;
  }
}

async function verifyMonitor(page, { baseUrl, width, capture, diagnostics }) {
  await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
  await page.goto(`${baseUrl}/monitor?section=activity`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("button-toggle-filters").waitFor();
  const allowedLabels = await page.locator("nav[aria-label='System Monitor'] button").allTextContents();
  assert.deepEqual(allowedLabels.map((label) => label.trim()), ["Dashboard Login", "Activity", "System Performance", "Analysis", "Audit Logs"], "Synthetic superuser retains all five allowed monitor sections");
  if (width < 768) {
    const trigger = page.getByTestId("button-monitor-sections");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const sheet = page.getByTestId("monitor-sections-sheet");
    await sheet.waitFor();
    await assertFocusWithin(page, sheet, "Monitor section sheet receives keyboard focus");
    await assertDialogFits(sheet, "Monitor section sheet", diagnostics);
    assert.equal(await sheet.getByRole("navigation", { name: "System Monitor sections", exact: true }).getByRole("button").count(), allowedLabels.length);
    await capture("monitor-sections", width);
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "hidden" });
    await assertFocus(page, trigger, "Monitor Escape restores current section trigger");
    await trigger.press("Enter");
    await sheet.getByRole("button", { name: /^Analysis\b/ }).click();
    await sheet.waitFor({ state: "hidden" });
    await page.getByTestId("text-analysis-title").waitFor();
    await assertFocus(page, trigger, "Monitor selection restores current section trigger");
    assert.match(await trigger.getAttribute("aria-label"), /current: Analysis$/);
  } else {
    const analysis = page.getByRole("navigation", { name: "System Monitor", exact: true }).getByRole("button", { name: "Analysis", exact: true });
    await analysis.focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("text-analysis-title").waitFor();
    assert.equal(await analysis.getAttribute("aria-current"), "page");
    await assertFocus(page, analysis, "Desktop Monitor section selection retains focus");
  }
  await capture("monitor-analysis-selected", width);
}

async function verifyActivity(page, { baseUrl, width, capture, diagnostics }) {
  await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
  await page.goto(`${baseUrl}/monitor?section=activity`, { waitUntil: "domcontentloaded" });
  const row = page.locator("[data-testid^='activity-row-']").first();
  await row.waitFor();
  const id = (await row.getAttribute("data-testid")).replace("activity-row-", "");
  const more = page.getByTestId(`button-activity-actions-${id}`);
  const investigate = page.getByTestId(`button-investigate-${id}`);
  const openMenu = async () => {
    await more.scrollIntoViewIfNeeded();
    await more.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menu").waitFor();
  };
  await openMenu();
  await page.getByTestId(`button-kick-${id}`).waitFor();
  await page.getByTestId(`button-delete-${id}`).waitFor();
  assert.equal(await page.getByTestId(`button-ban-${id}`).count(), 0, "Activity never offers Ban for synthetic superuser");
  await capture("activity-row-actions", width);
  await page.keyboard.press("Escape");
  await page.getByRole("menu").waitFor({ state: "hidden" });
  await assertFocus(page, more, "Activity menu Escape restores its row trigger");
  for (const [action, title] of [["kick", "Kick User?"], ["delete", "Delete Activity Log?"]]) {
    for (const dismissal of ["cancel", "escape"]) {
      await openMenu();
      await page.getByTestId(`button-${action}-${id}`).click();
      const confirmation = page.getByRole("alertdialog", { name: title, exact: true });
      await confirmation.waitFor();
      await assertFocusWithin(page, confirmation, `Activity ${action} confirmation receives focus`);
      await assertDialogFits(confirmation, `Activity ${action} confirmation`, diagnostics);
      if (dismissal === "cancel") {
        await capture(`activity-${action}-confirmation`, width);
        await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
      } else await page.keyboard.press("Escape");
      await confirmation.waitFor({ state: "hidden" });
      await assertFocus(page, more, `Activity ${action} ${dismissal} restores row menu trigger`);
    }
  }
  const openInvestigation = async () => {
    await investigate.scrollIntoViewIfNeeded();
    await investigate.focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog").filter({ has: page.getByText("Session investigation", { exact: true }) });
    await drawer.waitFor();
    await drawer.getByRole("button", { name: "Force logout", exact: true }).waitFor();
    await assertDialogFits(drawer, "Activity investigation drawer", diagnostics);
    return drawer;
  };
  let drawer = await openInvestigation();
  await assertFocusWithin(page, drawer, "Activity investigation receives keyboard focus");
  await capture("activity-investigation", width);
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "hidden" });
  await assertFocus(page, investigate, "Activity investigation Escape restores original row trigger");
  for (const [action, title] of [["Force logout", "Kick User?"], ["Delete log", "Delete Activity Log?"]]) {
    drawer = await openInvestigation();
    await drawer.getByRole("button", { name: action, exact: true }).click();
    const confirmation = page.getByRole("alertdialog", { name: title, exact: true });
    await confirmation.waitFor();
    await drawer.waitFor({ state: "hidden" });
    await assertFocusWithin(page, confirmation, `Investigation ${action} transfers focus into confirmation`);
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    await confirmation.waitFor({ state: "hidden" });
    await assertFocus(page, investigate, `Investigation ${action} cancellation restores original row trigger`);
  }
  await row.waitFor();
  // No moderation confirmation is accepted; only synthetic read-only inspection.
}

export async function runFrontendRedesignBrowser({ baseUrl, username, password, artifactsDir, final = false, options = resolveRedesignCaptureOptions({}, final), prepareBillingFixture }) {
  assert.equal(new URL(baseUrl).hostname, "127.0.0.1");
  assert.ok(prepareBillingFixture === undefined || typeof prepareBillingFixture === "function");
  const browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  const { widths, themes, routeIds, checks } = options;
  const selectedRoutes = routes.filter((route) => routeIds.includes(route.id));
  const manifest = { syntheticDataOnly: true, realBackend: true, widths, themes, routeIds, requestedChecks: checks, checks: [], diagnostics: [], screenshots: [], sectionScreenshots: [], accessibility: [], manualAccessibility: [], errors: [], externalRequests: [], pageErrors: [] };
  const persist = () => writeFile(path.join(artifactsDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  let phase = "browser setup";
  let billingFixture;
  try {
    for (const theme of themes) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: theme, reducedMotion: "reduce", locale: "en-US", timezoneId: "Asia/Kuala_Lumpur", serviceWorkers: "block" });
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin === baseUrl || ["blob:", "data:"].includes(url.protocol)) return route.continue();
        manifest.externalRequests.push(url.origin); return route.abort();
      });
      await context.addInitScript((nextTheme) => {
        localStorage.setItem("theme", nextTheme);
        // Init scripts precede document parsing; the application applies its
        // root class from this stored preference once the root exists.
      }, theme);
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      page.on("pageerror", () => manifest.pageErrors.push({ phase, kind: "Browser runtime error" }));
      let loginSucceeded = false;
      async function captureSection(id, locator, width) {
        await locator.scrollIntoViewIfNeeded();
        const bounds = await locator.boundingBox();
        assert.ok(bounds && bounds.width > 0 && bounds.width <= width + 1 && bounds.height > 0 && bounds.height <= 1800, `${id} is a bounded readable section`);
        const file = `${id}-${theme}-${width}-section.png`;
        await locator.screenshot({ path: path.join(artifactsDir, file), animations: "disabled", caret: "hide", timeout: 30_000 });
        manifest.sectionScreenshots.push({ id, theme, width, file, renderedWidth: bounds.width, renderedHeight: bounds.height });
        await persist();
      }
      async function capture(id, width) {
        const file = `${id}-${theme}-${width}.png`;
        const viewportFile = `${id}-${theme}-${width}-viewport.png`;
        // Only authenticated Navbar currently applies the persisted theme.
        // Public Login is captured as it really renders, never forced by QA.
        if (id !== "login") {
          await page.waitForFunction((requestedTheme) =>
            document.documentElement.dataset.theme === requestedTheme
            && document.documentElement.classList.contains("dark") === (requestedTheme === "dark"),
          theme, { timeout: 3_000 });
        }
        if (id === "collection-records" && width < 768) {
          await assertButtonContentsFit(page.getByRole("button", { name: /^Search & Filters(?: \d+)?$/ }), "Collection filter launcher", manifest.diagnostics);
        }
        if (checks.includes("a11y") && ["collection-record-actions", "collection-export-excel-menu", "collection-export-pdf-menu",
          "saved-file-actions", "viewer-more-actions", "activity-row-actions"].includes(id)) {
          manifest.manualAccessibility.push(await verifyModalMenuKeyboard(page, { id, theme, width }));
        }
        const layout = await page.evaluate(() => ({
          appliedTheme: document.documentElement.dataset.theme ?? null,
          darkClass: document.documentElement.classList.contains("dark"),
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          mainCount: document.querySelectorAll("main").length,
          headingCount: document.querySelectorAll("h1,h2,h3").length,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        }));
        await page.screenshot({ path: path.join(artifactsDir, viewportFile), fullPage: false, animations: "disabled", caret: "hide", timeout: 30_000 });
        await page.screenshot({ path: path.join(artifactsDir, file), fullPage: true, animations: "disabled", caret: "hide", timeout: 30_000 });
        manifest.screenshots.push({ id, theme, width, file, viewportFile, path: new URL(page.url()).pathname, ...layout });
        if (checks.includes("a11y")) {
          const result = await runRedesignAccessibility(page);
          manifest.accessibility.push({ id, theme, width, ...result });
        }
        await persist();
        if ((width === 1440 || width === 390) && ["home", "general-search", "collection-records"].includes(id)) {
          console.log(`[frontend-redesign] First review screenshot: ${path.join(artifactsDir, file)}`);
        }
      }
      try {
        phase = `${theme} login baseline`;
        await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
        await page.getByTestId("input-username").waitFor();
        for (const width of routeIds.includes("login") ? widths : []) {
          await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
          await capture("login", width);
        }
        if (routeIds.includes("login")) console.log(`[frontend-redesign] Captured login/${theme} at ${widths.join(", ")}.`);
        phase = `${theme} real password login`;
        await page.getByTestId("input-username").fill(username);
        await page.getByTestId("input-password").fill(password);
        const login = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST");
        await page.getByTestId("input-password").press("Enter");
        assert.equal((await login).status(), 200, "Synthetic account logs in through actual UI");
        loginSucceeded = true;
        await page.locator("main#main-content").waitFor();
        if (prepareBillingFixture && !billingFixture) {
          phase = "once-only opt-in isolated Billing fixture";
          billingFixture = await prepareBillingFixture(page);
          // Only synthetic dataset evidence is public; no callback, environment,
          // password or session material is serialized into the manifest.
          manifest.billingFixture = { year: billingFixture.year, month: billingFixture.month, nickname: billingFixture.nickname, evidence: billingFixture.evidence };
          await persist();
        }
        for (const route of selectedRoutes) {
          for (const width of widths) {
            phase = `${route.id}/${theme}/${width}`;
            try {
              await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
              await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
              await page.locator(route.ready).first().waitFor();
              if (route.collectionSave) await prepareCollectionSave(page);
              if (route.collectionSummary) await prepareCollectionSummary(page, width);
              if (route.collectionMonthly) await prepareCollectionMonthly(page);
              if (billingFixture && route.id === "collection-records") await scopeOriginalCollectionRecords(page, width);
              if (billingFixture && route.id === "billing-principal") await preparePopulatedBilling(page, billingFixture);
              if (billingFixture && route.id === "collection-daily") await preparePopulatedDaily(page, billingFixture);
              if (route.settings) await page.getByRole("button", { name: "Save Changes", exact: true }).waitFor();
              if (route.roles) {
                await selectRolesSettings(page, width);
              }
              if (route.viewer) {
                await page.getByTestId("button-view-fixture-card-source-a").click();
                await page.getByRole("region", { name: "Viewer data columns" }).waitFor();
              }
              await page.evaluate(() => document.fonts.ready);
              await page.waitForTimeout(350);
              await page.evaluate(() => window.scrollTo(0, 0));
              await capture(route.id, width);
              if (billingFixture && route.id === "billing-principal") await captureBillingSections(page, width, capture);
            } catch (error) {
              const failure = { phase, kind: "Route readiness or screenshot failed" };
              if (error?.code === "ERR_ASSERTION") failure.kind = String(error.message).split("\n")[0];
              if (route.id === "collection-records") {
                failure.step = error.redesignStep;
                failure.errorType = error.name;
                failure.failureFile = `records-failed-${theme}-${width}.png`;
                await page.screenshot({ path: path.join(artifactsDir, failure.failureFile), animations: "disabled", caret: "hide" }).catch(() => {});
              }
              if (route.id === "collection-daily") {
                failure.step = error.redesignStep;
                failure.errorType = error.name;
                const firstLine = String(error.message || "").split("\n")[0];
                if (firstLine.startsWith("locator.")) failure.selectorError = firstLine.slice(0, 512);
                failure.failureFile = `daily-failed-${theme}-${width}.png`;
                await page.screenshot({ path: path.join(artifactsDir, failure.failureFile), animations: "disabled", caret: "hide" }).catch(() => {});
              }
              if (route.roles) {
                failure.step = error.redesignStep;
                failure.settingsState = error.redesignSettingsState;
                failure.errorType = error.name;
                failure.failureFile = `roles-failed-${theme}-${width}.png`;
                failure.failureHtml = `roles-failed-${theme}-${width}.html`;
                await page.screenshot({ path: path.join(artifactsDir, failure.failureFile), animations: "disabled", caret: "hide" }).catch(() => {});
                const mainHtml = await page.locator("main#main-content").evaluate((element) => {
                  const clone = element.cloneNode(true);
                  // Diagnostic markup excludes input values and never includes
                  // document scripts, storage, cookies or authentication headers.
                  for (const input of clone.querySelectorAll("input")) input.removeAttribute("value");
                  for (const textarea of clone.querySelectorAll("textarea")) textarea.textContent = "";
                  for (const script of clone.querySelectorAll("script")) script.remove();
                  return clone.outerHTML;
                }).catch(() => "<main>Settings diagnostic unavailable</main>");
                await writeFile(path.join(artifactsDir, failure.failureHtml), mainHtml);
              }
              manifest.errors.push(failure);
              await persist();
              console.log(`[frontend-redesign] Capture failed: ${phase}.`);
            }
          }
          console.log(`[frontend-redesign] Captured ${route.id}/${theme}.`);
        }
        for (const check of checks.filter((entry) => entry !== "a11y")) {
          for (const width of widths) {
            phase = `workflow-${check}/${theme}/${width}`;
            const diagnostics = [];
            try {
              const workflow = { shell: verifyShell, search: verifyPopulatedSearch, collection: verifyCollection, "collection-export": verifyCollectionExport, saved: verifySaved, viewer: verifyViewer, settings: verifySettings, "settings-deep-links": verifySettingsDeepLinks, monitor: verifyMonitor, activity: verifyActivity, daily: verifyDaily }[check];
              await workflow(page, { baseUrl, width, capture, captureSection, diagnostics, billingFixture });
              manifest.checks.push({ check, theme, width, passed: true });
              console.log(`[frontend-redesign] PASS ${phase}.`);
            } catch (error) {
              manifest.errors.push({ phase, kind: error?.code === "ERR_ASSERTION" ? String(error.message).split("\n")[0] : "Real UI workflow failed; sensitive details suppressed", ...(error.redesignStep ? { step: error.redesignStep, settingsState: error.redesignSettingsState, errorType: error.name } : {}) });
              console.log(`[frontend-redesign] Workflow failed: ${phase}.`);
            }
            manifest.diagnostics.push({ phase, bounds: diagnostics });
            await persist();
          }
        }
      } finally {
        // Revoke the real synthetic session without retaining cookie files.
        if (loginSucceeded) {
          const logoutStatus = await page.evaluate(async () => {
            const csrf = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("sqr_csrf="))?.split("=").slice(1).join("=");
            return (await fetch("/api/activity/logout", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}) }, body: "{}" })).status;
          }).catch(() => null);
          if (logoutStatus !== 200) manifest.errors.push({ phase: `${theme} logout`, kind: "Synthetic session logout did not succeed" });
        }
        await context.close();
      }
    }
  } catch { manifest.errors.push({ phase, kind: "Browser phase failed; sensitive details suppressed" }); }
  finally {
    const reviewed = manifest.accessibility.map((entry) => reviewRedesignAccessibilityViolations(entry, manifest.manualAccessibility));
    manifest.accessibilityVerdict = {
      automatedViolationCount: manifest.accessibility.reduce((total, entry) => total + entry.violations.length, 0),
      keyboardResolvedCount: reviewed.reduce((total, entry) => total + entry.manuallyResolved.length, 0),
      unresolvedViolationCount: reviewed.reduce((total, entry) => total + entry.unresolved.length, 0),
    };
    await persist(); await browser.close();
  }
  assert.equal(manifest.errors.length, 0, `${manifest.errors.length} browser phases failed; see synthetic manifest`);
  assert.equal(manifest.pageErrors.length, 0, "Browser runtime errors occurred; see synthetic manifest");
  assert.equal(manifest.screenshots.some((screenshot) => screenshot.horizontalOverflow), false, "Document horizontal overflow occurred; see synthetic manifest");
  if (manifest.accessibilityVerdict.keyboardResolvedCount > 0) {
    console.log(`[frontend-redesign] ${manifest.accessibilityVerdict.automatedViolationCount} raw axe findings retained; ${manifest.accessibilityVerdict.keyboardResolvedCount} exact modal-menu focus findings resolved with actual Tab, Shift+Tab, Escape and reopen evidence.`);
  }
  assert.equal(manifest.accessibilityVerdict.unresolvedViolationCount, 0, "Unresolved WCAG accessibility violations occurred; see raw findings and keyboard evidence in synthetic manifest");
}
