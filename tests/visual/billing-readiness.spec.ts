import { expect, test } from "@playwright/test";
import { operationalContractRouteSpecs } from "../../scripts/lib/ui-operational-contract-matrix.mjs";

const billingRoute = operationalContractRouteSpecs.find(
  (routeSpec: { id: string }) => routeSpec.id === "billing-principal",
);
if (!billingRoute) throw new Error("Billing Principal must remain in the operational UI matrix.");
const readySelector: string = billingRoute.readySelector;

const calendar = '<div role="region" aria-label="Scrollable system calendar">Calendar days</div>';
const table = '<table aria-label="Table A System Billing Principal result"><tbody><tr><td>100.00</td></tr></tbody></table>';

// Exercise the shared CSS selector in Chromium without a server, login, or snapshots.
// The full visual/accessibility runners use this exact selector against the real app.
for (const fixture of [
  { name: "initial target loading", state: "loading", body: '<p role="status">Loading saved targets</p>' },
  { name: "target list error", state: "error", body: '<p role="alert">Could not load targets</p>' },
  { name: "reload with stale calendar", state: "loading", body: calendar },
  { name: "overview pending", state: "populated", body: "<p>Loading Billing Principal</p>" },
  { name: "overview error", state: "populated", body: '<p role="alert">Could not load overview</p>' },
  { name: "calendar pending", state: "populated", body: table + '<p role="status">Loading calendar</p>' },
  { name: "calendar error", state: "populated", body: table + '<p role="alert">Could not load calendar</p>' },
  { name: "error alongside stale calendar", state: "populated", body: table + calendar + '<p role="alert">Access changed</p>' },
]) {
  test(`Billing readiness excludes ${fixture.name}`, async ({ page }) => {
    await page.setContent(`<main><div data-testid="billing-principal-page" data-state="${fixture.state}">${fixture.body}</div></main>`);
    await expect(page.locator(readySelector)).toHaveCount(0);
  });
}

test("Billing readiness accepts the successful empty page root", async ({ page }) => {
  await page.setContent('<main><div data-testid="billing-principal-page" data-state="empty"><h2>Billing Principal (OSP)</h2><p>No saved target is available.</p></div></main>');

  await expect(page.locator(readySelector)).toHaveCount(1);
  await expect(page.locator(readySelector)).toBeVisible();
  await expect(page.locator(readySelector)).toHaveAttribute("data-testid", "billing-principal-page");
});

test("Billing readiness measures the loaded page root, not its wide scrollable calendar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 16px; }
      [data-testid="billing-principal-page"] { width: 100%; min-width: 0; }
      [aria-label="Scrollable system calendar"] { overflow-x: auto; }
      .calendar-grid { width: 1100px; }
    </style>
    <main><div data-testid="billing-principal-page" data-state="populated">
      <h2>Billing Principal (OSP)</h2>${table}
      <div role="region" aria-label="Scrollable system calendar"><div class="calendar-grid">Calendar days</div></div>
    </div></main>
  `);

  const readyRoot = page.locator(readySelector);
  await expect(readyRoot).toHaveCount(1);
  await expect(readyRoot).toBeVisible();
  await expect(readyRoot).toHaveAttribute("data-testid", "billing-principal-page");
  const rootSize = await readyRoot.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  const calendarSize = await page.getByRole("region", { name: "Scrollable system calendar" }).evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(rootSize.scrollWidth).toBeLessThanOrEqual(rootSize.clientWidth + 1);
  expect(calendarSize.scrollWidth).toBeGreaterThan(calendarSize.clientWidth);
});
