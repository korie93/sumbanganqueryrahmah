import { expect, test, type Locator, type Page } from "@playwright/test";
import type { SettingCategory, SettingItem } from "../../client/src/pages/settings/types";
import {
  assertAccountFixtureClean,
  installAccountManagementFixture,
  openAccountManagement,
} from "./helpers/account-management-fixture";

// Real Settings page and controls; fictional contracts on the existing isolated
// built loopback runner. No backend, production login or setting write is used.
test.use({ serviceWorkers: "block" });
const categories: SettingCategory[] = [
  { id: "general", name: "General", description: "Global platform behavior and identity settings.", settings: [] },
  { id: "security", name: "Security", description: "Authentication, session, and account safety policy.", settings: [] },
  { id: "ai-search", name: "AI & Search", description: "AI assistant and search tuning configuration.", settings: [] },
  { id: "data-management", name: "Data Management", description: "Data processing, viewer, and indexing limits.", settings: [] },
  { id: "backup-policy", name: "Backup & Restore", description: "Backup lifecycle and recovery controls.", settings: [] },
  { id: "roles-permissions", name: "Roles & Permissions", description: "Role behavior and privilege defaults.", settings: [] },
  { id: "system-monitoring", name: "System Monitoring", description: "WebSocket and runtime diagnostics settings.", settings: [] },
];
const destinations = [
  ...categories.map((category) => ({ id: category.id, label: category.id === "backup-policy" ? "Backup Settings" : category.name, heading: category.id === "backup-policy" ? "Backup Settings" : category.name })),
  { id: "backup-restore", label: "Backup & Restore", heading: "Backup & Restore" },
  { id: "account-management", label: "Account Management", heading: "Account Management" },
];
const setting: SettingItem = {
  key: "synthetic_platform_name", label: "Synthetic platform name", description: "Fictional display value for unsaved navigation feedback.",
  type: "text", value: "SQR", defaultValue: "SQR", isCritical: false, updatedAt: null,
  permission: { canView: true, canEdit: true }, options: [],
};
const launcher = (page: Page) => page.getByTestId("button-open-settings-sections");
const menu = (page: Page) => page.getByRole("dialog", { name: "Settings Menu", exact: true });
const nav = (page: Page) => page.getByRole("navigation", { name: "Settings Navigation", exact: true });

async function installNavigationFixture(page: Page, baseURL: string | undefined, options: Parameters<typeof installAccountManagementFixture>[2] = {}) {
  const fixture = await installAccountManagementFixture(page, baseURL, options);
  const origin = new URL(baseURL!).origin;
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    expect(new URL(route.request().url()).origin).toBe(origin);
    fixture.requests.push("GET /api/settings");
    return route.fulfill({ json: { categories: categories.map((category) => ({
      ...category, settings: category.id === "general" ? [setting] : [],
    })) }, headers: { "Cache-Control": "no-store" } });
  });
  await page.route("**/api/backups?*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    expect(url.origin).toBe(origin);
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: "1", pageSize: "20", sortBy: "newest" });
    fixture.requests.push("GET /api/backups");
    return route.fulfill({ json: { backups: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } },
      headers: { "Cache-Control": "no-store" } });
  });
  return fixture;
}

async function assertTargetsAtLeast44(controls: Locator) {
  const sizes = await controls.evaluateAll((elements) => elements.map((element) => {
    const { height, width } = element.getBoundingClientRect();
    return { height, width };
  }));
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.every(({ height, width }) => height >= 44 && width >= 44)).toBe(true);
}

async function assertNavigationBeforeHeading(page: Page, control: Locator, heading: string) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const title = page.getByRole("heading", { level: 1, name: heading, exact: true });
  await expect(title).toBeVisible();
  const position = await control.boundingBox();
  const titlePosition = await title.boundingBox();
  expect(position).not.toBeNull();
  expect(titlePosition).not.toBeNull();
  expect(position!.y + position!.height).toBeLessThanOrEqual(titlePosition!.y + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function chooseDestination(page: Page, label: string, mobile: boolean) {
  if (mobile || await launcher(page).isVisible()) {
    await launcher(page).press("Enter");
    await expect(menu(page)).toBeVisible();
    await menu(page).getByRole("button", { name: new RegExp(`^${label}(?:\\s|$)`) }).press("Enter");
    await expect(menu(page)).toBeHidden();
  } else await nav(page).getByRole("button", { name: label, exact: true }).click();
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 768, 1366]) {
    test(`Settings primary navigation keeps nine destinations and one aligned heading at ${width}px ${theme}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 1000 });
      const fixture = await installNavigationFixture(page, baseURL, { theme });
      await openAccountManagement(page);
      await assertNavigationBeforeHeading(page, launcher(page), "Account Management");
      await assertTargetsAtLeast44(launcher(page));
      await expect(launcher(page)).toHaveAttribute("aria-label", "Browse Settings: Account Management");
      await expect(launcher(page)).toHaveAttribute("aria-expanded", "false");
      await launcher(page).focus();
      await launcher(page).press("Enter");
      await expect(menu(page)).toBeVisible();
      await expect(launcher(page)).toHaveAttribute("aria-expanded", "true");
      const menuNav = menu(page).getByRole("navigation", { name: "Settings Navigation", exact: true });
      await expect(menuNav.getByRole("button")).toHaveCount(9);
      for (const destination of destinations) {
        await expect(menuNav.getByRole("button", { name: new RegExp(`^${destination.label}(?:\\s|$)`) })).toBeVisible();
      }
      await assertTargetsAtLeast44(menuNav.getByRole("button"));
      await assertTargetsAtLeast44(menu(page).getByRole("button", { name: "Close", exact: true }));
      await expect(menuNav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(menuNav.getByRole("button", { name: /^Account Management(?:\s|$)/ })).toHaveAttribute("aria-current", "page");
      expect(await menu(page).evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(menu(page)).toBeHidden();
      await expect(launcher(page)).toBeFocused();

      // Every authorized page is exercised through the real category callback.
      // Backup configuration and operational backup keep distinct destinations.
      for (const destination of destinations) {
        await chooseDestination(page, destination.label, width < 768);
        await expect(page).toHaveURL(new RegExp(`/settings\\?section=${destination.id}$`));
        const chooser = width < 768 || destination.id === "account-management" ? launcher(page) : nav(page);
        await assertNavigationBeforeHeading(page, chooser, destination.heading);
        await assertTargetsAtLeast44(width < 768 || destination.id === "account-management" ? chooser : chooser.getByRole("button"));
        if (width >= 768 && destination.id === "general") {
          await expect(nav(page).getByRole("button", { name: "General", exact: true })).toBeFocused();
          await expect(launcher(page)).toHaveCount(0);
        }
        if (destination.id === "general") await page.screenshot({
          path: test.info().outputPath(`settings-primary-navigation-${width}-${theme}.png`), animations: "disabled",
        });
        if (destination.id === "backup-restore" && width === 320) {
          const filters = page.getByTestId("button-toggle-backup-filters");
          await expect(filters).toHaveAttribute("aria-expanded", "false");
          expect(await filters.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
          await page.screenshot({ path: test.info().outputPath(`settings-backup-filters-${width}-${theme}.png`), animations: "disabled" });
          await filters.press("Enter");
          await expect(filters).toHaveAttribute("aria-expanded", "true");
          await expect(page.getByRole("searchbox", { name: "Search Name", exact: true })).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          await filters.press("Space");
          await expect(filters).toHaveAttribute("aria-expanded", "false");
          expect(await filters.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        }
      }
      await page.screenshot({ path: test.info().outputPath(`settings-account-chooser-${width}-${theme}.png`), animations: "disabled" });
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: "Account Management", exact: true })).toBeVisible();
      await expect(launcher(page)).toHaveAttribute("aria-label", "Browse Settings: Account Management");
      expect(fixture.writes).toEqual([]);
      await assertAccountFixtureClean(page, fixture);
    });
  }
}

for (const width of [320, 1366]) {
  test(`Settings dirty badge remains understandable while switching categories at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 1000 });
    const fixture = await installNavigationFixture(page, baseURL);
    await page.goto("/settings?section=general");
    await expect(page.getByRole("heading", { level: 1, name: "General", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Synthetic platform name", exact: true }).fill("Synthetic changed title");
    await expect(page.getByText("1 unsaved change", { exact: true })).toBeVisible();
    if (width < 768) {
      await launcher(page).click();
      await expect(menu(page)).toBeVisible();
    }
    await expect(nav(page).getByLabel("1 unsaved changes", { exact: true })).toBeVisible();
    await nav(page).getByRole("button", { name: /^Security(?:\s|$)/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Security", exact: true })).toBeVisible();
    if (width < 768) {
      await expect(menu(page)).toBeHidden();
      await expect(launcher(page)).toBeFocused();
      await launcher(page).press("Enter");
      await expect(menu(page)).toBeVisible();
    }
    await expect(nav(page).getByLabel("1 unsaved changes", { exact: true })).toBeVisible();
    await nav(page).getByRole("button", { name: /^General(?:\s|$)/ }).click();
    await expect(page.getByRole("textbox", { name: "Synthetic platform name", exact: true })).toHaveValue("Synthetic changed title");
    await page.getByRole("textbox", { name: "Synthetic platform name", exact: true }).fill("SQR");
    await expect(page.getByText("No unsaved changes", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Changes", exact: true })).toBeDisabled();
    expect(fixture.writes).toEqual([]);
    await assertAccountFixtureClean(page, fixture);
  });
}

for (const role of ["admin", "manager", "user"] as const) {
  test(`Settings header does not expose privileged destinations to ${role}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    const fixture = await installNavigationFixture(page, baseURL, { role });
    await page.goto("/settings?section=account-management");
    if (role === "admin") {
      await expect(page.getByRole("heading", { level: 1, name: "General", exact: true })).toBeVisible();
      await expect(nav(page).getByRole("button")).toHaveCount(7);
      await expect(nav(page).getByRole("button", { name: "Backup Settings", exact: true })).toBeVisible();
      await expect(nav(page).getByRole("button", { name: "Backup & Restore", exact: true })).toHaveCount(0);
      await expect(nav(page).getByRole("button", { name: "Account Management", exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByTestId("home-dashboard")).toBeVisible();
      await expect(nav(page)).toHaveCount(0);
      await expect(launcher(page)).toHaveCount(0);
      expect(fixture.requests).not.toContain("GET /api/settings");
    }
    expect(fixture.requests.some((endpoint) => endpoint.includes("/api/admin/"))).toBe(false);
    expect(fixture.writes).toEqual([]);
    await assertAccountFixtureClean(page, fixture);
  });
}
