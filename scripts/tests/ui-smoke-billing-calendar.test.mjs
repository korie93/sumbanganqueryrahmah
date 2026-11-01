import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../ui-smoke.mjs", import.meta.url), "utf8");
const flowStart = source.indexOf("const checkBillingPrincipalV9UiFlow = async");
const start = source.indexOf('await page.getByRole("heading", { name: "System calendar", exact: true })', flowStart);
const endMarker = 'await dialog.waitFor({ state: "hidden" });';
const end = source.indexOf(endMarker, start);
assert.ok(flowStart >= 0 && start > flowStart && end > start);
const calendarFlow = source.slice(start, end + endMarker.length);

for (const [asOf, validityStart] of [
  ["2026-11-01", "2026-10-31"],
  ["2027-01-01", "2026-12-31"],
  ["2028-03-01", "2028-02-29"],
  ["2026-11-15", "2026-11-14"],
]) {
  test(`Billing smoke opens ${asOf} when source validity starts on ${validityStart}`, async () => {
    let month = validityStart.slice(0, 7);
    let openedDate = null;
    let aging = "ALL";
    const steps = [];
    const page = {
      getByRole(role, options) {
        if (role === "heading") {
          assert.equal(options.name, "System calendar");
          assert.equal(options.exact, true);
          return { async waitFor() { steps.push("calendar ready"); } };
        }
        assert.equal(role, "button");
        assert.ok(options.name.test(`${asOf}, 0 accounts, new closed RM 0.00`));
        assert.equal(options.name.test(`${asOf}, 1 accounts, new closed RM 1.00`), false);
        return { async click() {
          assert.equal(month, asOf.slice(0, 7), "Requested day is absent until its month is selected");
          openedDate = asOf;
          steps.push("open requested day");
        } };
      },
      getByLabel(label, options) {
        assert.equal(label, "Month");
        assert.equal(options.exact, true);
        return { async fill(value) {
          // A caller must await selection before attempting to click the day.
          await new Promise(resolve => setImmediate(resolve));
          assert.equal(value, asOf.slice(0, 7));
          month = value;
          steps.push("select requested month");
        } };
      },
      keyboard: { async press(key) {
        assert.equal(key, "Escape");
        assert.equal(openedDate, asOf);
        openedDate = null;
        steps.push("close dialog");
      } },
    };
    const dialog = {
      getByRole(role, options) {
        assert.equal(options.exact, true);
        if (role === "heading") {
          assert.equal(options.name, `Accounts closed · ${asOf}`);
          return { async waitFor() {
            assert.equal(openedDate, asOf);
            steps.push("requested date heading");
          } };
        }
        assert.equal(role, "tab");
        assert.equal(options.name, "D6");
        return { async click() { aging = "D6"; steps.push("D6 tab"); } };
      },
      getByText(text, options) {
        assert.equal(options.exact, true);
        return { async waitFor() {
          assert.equal(openedDate, asOf);
          assert.equal(text, `No ${aging} accounts closed on this date.`);
          steps.push(`${aging} empty state`);
        } };
      },
      async waitFor(options) {
        assert.equal(options.state, "hidden");
        assert.equal(openedDate, null);
        steps.push("dialog hidden");
      },
    };
    // Run the actual smoke sequence; do not replace it with a month-math test.
    await vm.runInNewContext(`(async () => { ${calendarFlow} })()`, { page, dialog, asOf });
    assert.deepEqual(steps, ["calendar ready", "select requested month", "open requested day",
      "requested date heading", "ALL empty state", "D6 tab", "D6 empty state", "close dialog", "dialog hidden"]);
  });
}
