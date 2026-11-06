import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  assertAccountFixtureClean,
  installAccountManagementFixture,
} from "./helpers/account-management-fixture";
import {
  checkFixture,
  installFixture as installCollectionFixture,
  openSave,
} from "./helpers/save-collection-fixture";

// Real built frontend with local-only fictional sessions and intercepted HTTP.
// Inspect geometry and working controls, rather than source class strings.
test.use({ serviceWorkers: "block" });
const themes = ["light", "dark"] as const;

for (const theme of themes) {
  for (const width of [375, 1366]) {
    test("layout repair L11 backup actions and prose metrics fit at " + width + "px " + theme, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      await modelLocalConnectivity(page);
      const fixture = await installCollectionFixture(page, baseURL, { role: "superuser", theme });
      const origin = new URL(baseURL!).origin;
      let reads = 0;
      const rejectedWrites: string[] = [];
      await page.route((url) => url.origin === origin && url.pathname === "/api/settings", (route) => route.fulfill({ json: {
        categories: [{ id: "general", name: "General", description: "Synthetic layout settings", settings: [] }],
      } }));
      await page.route((url) => url.origin === origin && url.pathname.startsWith("/api/backups"), (route) => {
        if (route.request().method() !== "GET") {
          rejectedWrites.push(route.request().method() + " " + new URL(route.request().url()).pathname);
          return route.abort();
        }
        reads += 1;
        return route.fulfill({ json: { backups: [{
          id: "synthetic-layout-backup", name: "Synthetic operations checkpoint", createdBy: "synthetic.operator",
          createdAt: "2026-10-01T08:00:00.000Z", metadata: null,
        }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } });
      });
      try {
        await page.goto("/settings?section=backup-restore");
        await expect(page.getByTestId("backup-item-synthetic-layout-backup")).toBeVisible();
        const controls = ["button-export-backups", "button-refresh-backups", "button-create-backup"];
        const boxes = await Promise.all(controls.map((id) => page.getByTestId(id).boundingBox()));
        for (const box of boxes) {
          expect(box).toBeTruthy();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        }
        expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThanOrEqual(1);
        if (width >= 768) {
          expect(Math.abs(boxes[1]!.y - boxes[2]!.y)).toBeLessThanOrEqual(1);
          expect(boxes[0]!.x + boxes[0]!.width).toBeLessThanOrEqual(boxes[1]!.x);
          expect(boxes[1]!.x + boxes[1]!.width).toBeLessThanOrEqual(boxes[2]!.x);
        } else {
          expect(boxes[2]!.y).toBeGreaterThanOrEqual(boxes[0]!.y + boxes[0]!.height);
          expect(boxes[2]!.width).toBeGreaterThan(boxes[0]!.width);
        }
        const status = page.locator(".ops-metric").filter({ has: page.getByText("Status kerja", { exact: true }) });
        await expect(status.locator(".ops-metric-value")).toHaveCSS("font-size", "16px");
        const beforeRefresh = reads;
        await page.getByTestId("button-refresh-backups").click();
        await expect.poll(() => reads).toBeGreaterThan(beforeRefresh);
        const exportButton = page.getByTestId("button-export-backups");
        await expect(exportButton).toBeEnabled();
        await exportButton.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("button-export-csv")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(exportButton).toBeFocused();
        expect(rejectedWrites).toEqual([]);
        await checkFixture(page, fixture);
      } finally {
        fixture.release();
      }
    });
  }
}

async function modelLocalConnectivity(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
}

const layoutLongNicknames = [
  "SYNTHETIC_COLLECTOR_".padEnd(60, "A"),
  "Synthetic Collector Beta Administration And Collection Team".padEnd(60, "B").slice(0, 60),
];

for (const theme of themes) {
  for (const width of [320, 375, 1366]) {
    test("layout repair L09 populated nickname badges and total remain readable at " + width + "px " + theme, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      await modelLocalConnectivity(page);
      const fixture = await installCollectionFixture(page, baseURL, { role: "admin", theme, aiEnabled: true });
      const origin = new URL(baseURL!).origin;
      const reads: string[] = [];
      const rejectedWrites: string[] = [];
      await page.route((url) => url.origin === origin
        && ["/api/collection/nicknames", "/api/collection/nickname-summary"].includes(url.pathname), (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() !== "GET") {
          rejectedWrites.push(request.method() + " " + path);
          return route.abort();
        }
        reads.push(path);
        if (path === "/api/collection/nicknames") return route.fulfill({ json: {
          ok: true,
          nicknames: layoutLongNicknames.map((nickname, index) => ({
            id: "ea7ad4fd-fd18-4b25-a75e-f87e1a8a010" + (index + 1),
            nickname, isActive: true, roleScope: "both", createdBy: null,
            createdAt: "2026-10-01T08:00:00.000Z",
          })),
        } });
        return route.fulfill({ json: {
          ok: true, nicknames: layoutLongNicknames, totalRecords: 45, totalAmount: 48750,
          page: 1, pageSize: 50, limit: 50, offset: 0, records: [],
          nicknameTotals: layoutLongNicknames.map((nickname, index) => ({
            nickname, totalRecords: index ? 15 : 30, totalAmount: index ? 18750 : 30000,
          })),
          pagination: {
            mode: "hybrid", page: 1, pageSize: 50, limit: 50, offset: 0,
            total: 45, totalPages: 1, nextCursor: null, hasNextPage: false, hasPreviousPage: false,
          },
        } });
      });
      try {
        await page.goto("/collection/nickname-summary");
        const mobile = width < 768;
        if (mobile) await page.getByRole("button", { name: /^Summary Filters/ }).click();
        const sheet = mobile
          ? page.getByRole("dialog", { name: "Nickname Summary Filters", exact: true })
          : page.locator("main");
        await expect(sheet).toBeVisible();
        const nicknameTrigger = sheet.getByRole("button", { name: "Pilih staff nickname", exact: true });
        await nicknameTrigger.click();
        // The first checkbox is the shared Select All control. Individual
        // options are also asserted to prove both long strings were loaded.
        for (const nickname of layoutLongNicknames) {
          await expect(page.getByRole("checkbox", { name: nickname, exact: true })).toBeVisible();
        }
        await page.getByRole("checkbox").first().check();
        await page.keyboard.press("Escape");
        await expect(sheet.getByRole("button", { name: "2 nickname dipilih", exact: true })).toBeFocused();
        for (const [testId, day] of [
          ["collection-nickname-summary-from-date", "10"],
          ["collection-nickname-summary-to-date", "20"],
        ]) {
          await sheet.getByTestId(testId!).click();
          const calendar = page.getByRole("grid").last();
          await expect(calendar).toBeVisible();
          await calendar.locator('button[name="day"]:not(.day-outside)')
            .filter({ hasText: new RegExp("^" + day + "$") }).click();
        }
        const summaryResponse = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return url.origin === origin && url.pathname === "/api/collection/nickname-summary" && response.ok();
        });
        await sheet.getByRole("button", { name: "Apply", exact: true }).click();
        await (await summaryResponse).finished();
        // Applying keeps the Sheet open by design. Close only the Sheet
        // after its latest request has finished and the result is mounted.
        if (mobile) {
          await page.keyboard.press("Escape");
          await expect(sheet).toBeHidden();
        }
        await expect(page.getByRole("heading", { name: "Aggregate by Nickname", exact: true })).toBeVisible();
        for (const nickname of layoutLongNicknames) {
          const labels = page.locator("main").getByText(nickname, { exact: true });
          // Mobile also shows a selected-nickname preview above the results.
          expect(await labels.count()).toBeGreaterThanOrEqual(mobile ? 3 : 2);
          const geometry = await labels.evaluateAll((elements) => elements.map((element) => {
            const box = element.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(element);
            return {
              left: box.left, right: box.right, width: box.width,
              viewport: window.innerWidth, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
              text: [...range.getClientRects()].filter((rect) => rect.width && rect.height)
                .map((rect) => ({ left: rect.left, right: rect.right })),
            };
          }));
          for (const item of geometry) {
            expect(item.left, JSON.stringify(item)).toBeGreaterThanOrEqual(-1);
            expect(item.right, JSON.stringify(item)).toBeLessThanOrEqual(width + 1);
            expect(item.scrollWidth, JSON.stringify(item)).toBeLessThanOrEqual(item.clientWidth + 1);
            for (const text of item.text) {
              expect(text.left, JSON.stringify(item)).toBeGreaterThanOrEqual(item.left - 1);
              expect(text.right, JSON.stringify(item)).toBeLessThanOrEqual(item.right + 1);
            }
          }
        }
        // The metric's value is the label's sibling, independent of its CSS
        // implementation. A five-figure MYR value fits on one mobile line.
        const total = page.getByText("Grand Total Collection", { exact: true })
          .locator("..").locator("p").nth(1);
        await expect(total).toContainText("48,750.00");
        const totalGeometry = await total.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const lines = [...range.getClientRects()].filter((rect) => rect.width && rect.height);
          return {
            text: element.textContent, tops: [...new Set(lines.map((rect) => Math.round(rect.top)))],
            left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
          };
        });
        expect(totalGeometry.tops, JSON.stringify(totalGeometry)).toHaveLength(1);
        expect(totalGeometry.left).toBeGreaterThanOrEqual(-1);
        expect(totalGeometry.right).toBeLessThanOrEqual(width + 1);
        // Reproduce the actual bottom-right collision rather than asserting
        // marker classes: the last MYR amount is the table/mobile grand total.
        const lastAmount = page.getByText("RM 48,750.00", { exact: true }).last();
        await lastAmount.evaluate((element) => window.scrollTo({
          top: window.scrollY + element.getBoundingClientRect().bottom - (innerHeight - 55),
          behavior: "instant",
        }));
        await expect(page.getByTestId("floating-ai-toggle")).toBeVisible();
        await expect.poll(() => lastAmount.evaluate((element) => {
          const toggle = document.querySelector('[data-testid="floating-ai-toggle"]')!;
          const trigger = toggle.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(element);
          return [...range.getClientRects()].every((rect) =>
            Math.min(trigger.right, rect.right) <= Math.max(trigger.left, rect.left)
            || Math.min(trigger.bottom, rect.bottom) <= Math.max(trigger.top, rect.top));
        })).toBe(true);
        expect(reads.filter((path) => path === "/api/collection/nickname-summary")).toHaveLength(1);
        expect(rejectedWrites).toEqual([]);
        expect(fixture.saves).toEqual([]);
        await checkFixture(page, fixture);
      } finally {
        fixture.release();
      }
    });
  }
}

async function expectButtonContentFits(button: Locator) {
  await expect(button).toBeVisible();
  const geometry = await button.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const text: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width && rect.height) text.push({
          left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        });
      }
    }
    return {
      left: box.left, right: box.right, top: box.top, bottom: box.bottom,
      height: box.height, clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth, viewport: window.innerWidth, text,
    };
  });
  expect(geometry.text.length).toBeGreaterThan(0);
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  for (const text of geometry.text) {
    expect(text.left, JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.left - 1);
    expect(text.right, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.right + 1);
    expect(text.top, JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.top - 1);
    expect(text.bottom, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.bottom + 1);
  }
}

for (const theme of themes) {
  for (const width of [375, 1366]) {
    test("layout repair L02 roles stay below the workspace header at " + width + "px " + theme, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      await modelLocalConnectivity(page);
      const fixture = await installAccountManagementFixture(page, baseURL, { theme, settings: true });
      const settingsWrites: string[] = [];
      const modules = [
        "home", "saved", "viewer", "general_search", "import",
        "collection_report", "activity", "monitor", "analysis", "audit",
        "ai", "settings", "backup_restore", "dashboard", "account",
      ];
      const settings = ["manager", "admin", "user"].flatMap((role) => modules.map((module, index) => ({
        key: "tab_" + role + "_" + module + "_enabled",
        label: role[0]!.toUpperCase() + role.slice(1) + " Tab: " + module,
        description: "Synthetic permission label for wrapping and a realistic scrollable workspace.",
        type: "boolean", value: index % 3 ? "true" : "false", defaultValue: "false",
        isCritical: false, updatedAt: null, options: [], permission: { canView: true, canEdit: true },
      })));
      const origin = new URL(baseURL!).origin;
      await page.route((url) => url.origin === origin
        && ["/api/settings", "/api/settings/role-permissions"].includes(url.pathname), (route) => {
        if (route.request().method() !== "GET") {
          settingsWrites.push(route.request().method());
          return route.abort();
        }
        return route.fulfill({ json: { categories: [{
          id: "roles", name: "Roles & Permissions",
          description: "Synthetic role workspace", settings,
        }] } });
      });
      try {
        await page.goto("/settings?section=roles");
        const workspace = page.getByRole("region", { name: "Role and permission manager", exact: true });
        const heading = workspace.getByRole("heading", { name: "Role permission workspace", exact: true });
        const search = workspace.getByRole("textbox", { name: "Search permission or module", exact: true });
        await expect(heading).toBeVisible();
        await expect(workspace.getByRole("switch").first()).toBeVisible();
        // Scroll past its natural position, rather than scrollIntoView placing
        // an already-sticky node conveniently in the middle of the viewport.
        const documentTop = await heading.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
        await page.evaluate((top) => window.scrollTo(0, top + 220), documentTop);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(documentTop);
        await expect.poll(async () => {
          const bar = await page.locator(".workspace-topbar").boundingBox();
          const title = await heading.boundingBox();
          const control = await search.boundingBox();
          return Boolean(bar && title && control
            && title.y >= bar.y + bar.height - 1
            && control.y >= bar.y + bar.height - 1
            && title.y + title.height <= 900
            && control.y + control.height <= 900);
        }).toBe(true);
        await search.focus();
        await page.keyboard.type("viewer");
        await expect(search).toHaveValue("viewer");
        await expect(workspace.getByRole("switch").first()).toBeVisible();
        expect(settingsWrites).toEqual([]);
        expect(fixture.writes).toEqual([]);
        await assertAccountFixtureClean(page, fixture);
      } finally {
        fixture.releaseAll();
      }
    });
  }

  for (const width of [320, 375]) {
    test("layout repair L06 nickname summary has one title and usable mobile actions at " + width + "px " + theme, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      await modelLocalConnectivity(page);
      const fixture = await installCollectionFixture(page, baseURL, { role: "admin", theme });
      try {
        await page.goto("/collection/nickname-summary");
        await expect(page.getByRole("heading", { name: "Nickname Summary", exact: true })).toHaveCount(1);
        // Compare the declared shell minimum, rather than its content-driven
        // height: long mobile content must remain free to grow beyond it.
        const shellMinimum = await page.locator("main#main-content").evaluate((element) => {
          const topbar = document.querySelector(".workspace-topbar");
          return {
            minHeight: Number.parseFloat(getComputedStyle(element).minHeight),
            viewportHeight: window.innerHeight,
            topbarHeight: topbar?.getBoundingClientRect().height ?? Number.NaN,
          };
        });
        expect(Number.isFinite(shellMinimum.minHeight), JSON.stringify(shellMinimum)).toBe(true);
        expect(Number.isFinite(shellMinimum.topbarHeight), JSON.stringify(shellMinimum)).toBe(true);
        expect(Math.abs(shellMinimum.minHeight
          - (shellMinimum.viewportHeight - shellMinimum.topbarHeight)), JSON.stringify(shellMinimum))
          .toBeLessThanOrEqual(2);
        const filter = page.getByRole("button", { name: /^Summary Filters/ });
        const reset = page.getByRole("button", { name: "Reset", exact: true });
        await expectButtonContentFits(filter);
        await expectButtonContentFits(reset);
        const filterBox = await filter.boundingBox();
        const resetBox = await reset.boundingBox();
        expect(filterBox && resetBox && filterBox.x + filterBox.width <= resetBox.x + 1).toBe(true);
        await filter.focus();
        await page.keyboard.press("Enter");
        const sheet = page.getByRole("dialog", { name: "Nickname Summary Filters", exact: true });
        await expect(sheet).toBeVisible();
        await expect(sheet.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
        await expect(filter).toBeFocused();
        await checkFixture(page, fixture);
        expect(fixture.saves).toEqual([]);
      } finally {
        fixture.release();
      }
    });

    test("layout repair L07 payment calendar aligns weekdays and fits at " + width + "px " + theme, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      await modelLocalConnectivity(page);
      const fixture = await installCollectionFixture(page, baseURL, { role: "admin", theme });
      try {
        await openSave(page);
        const trigger = page.getByTestId("save-collection-payment-date");
        await trigger.click();
        const grid = page.getByRole("grid");
        const popup = page.getByRole("dialog").filter({ has: grid });
        await expect(popup).toBeVisible();
        const geometry = await grid.evaluate((element) => {
          const headers = [...element.querySelectorAll("thead th")];
          const cells = [...(element.querySelector("tbody tr")?.querySelectorAll("td") ?? [])];
          const center = (node: Element) => {
            const rect = node.getBoundingClientRect();
            return rect.left + rect.width / 2;
          };
          return { headers: headers.map(center), days: cells.map(center) };
        });
        expect(geometry.headers).toHaveLength(7);
        expect(geometry.days).toHaveLength(7);
        for (let index = 0; index < 7; index++) {
          expect(Math.abs(geometry.headers[index]! - geometry.days[index]!), JSON.stringify(geometry)).toBeLessThanOrEqual(1);
        }
        const box = await popup.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        expect(box!.y).toBeGreaterThanOrEqual(-1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(901);
        await popup.locator('button[name="day"]:not(.day-outside)').filter({ hasText: /^1$/ }).click();
        await expect(popup).toBeHidden();
        await expect(trigger).toContainText("01/10/2026");
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await checkFixture(page, fixture);
        expect(fixture.saves).toEqual([]);
      } finally {
        fixture.release();
      }
    });
  }
}
