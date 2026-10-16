import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createCollectionDailyDialogFocus } from "../collection-daily-dialog-focus";

function target(date?: string) {
  return {
    isConnected: true,
    disabled: false,
    hidden: false,
    focused: 0,
    dataset: { collectionDailyDate: date },
    matches() { return this.disabled; },
    closest() { return this.hidden ? {} : null; },
    getClientRects() { return [1]; },
    focus(options: FocusOptions) { assert.equal(options.preventScroll, true); this.focused++; },
  };
}

function fixture() {
  const day = target("2026-10-14");
  const receipt = target();
  const region = target();
  const calendar = target();
  const parent = {
    contains: (element: unknown) => element === receipt || element === region,
    querySelector: () => region,
  };
  const state = { parentOpen: false, otherOpen: false, dates: [day] };
  const doc = {
    body: {}, activeElement: day,
    querySelector: (selector: string) => selector.includes("day-dialog")
      ? state.parentOpen ? parent : null : calendar,
    querySelectorAll: (selector: string) => selector.includes("daily-date") ? state.dates
      : [...(state.parentOpen ? [parent] : []), ...(state.otherOpen ? [{}] : [])],
  } as unknown as Document;
  return { day, receipt, region, calendar, state, focus: createCollectionDailyDialogFocus(() => doc) };
}

function close(focus: ReturnType<typeof createCollectionDailyDialogFocus>, overlay: "day" | "receipt") {
  let prevented = false;
  focus.restore(overlay, { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
}

test("day close returns to the explicit pointer/keyboard launcher", () => {
  const f = fixture();
  f.focus.remember("day", f.day as unknown as HTMLElement, "2026-10-14");
  close(f.focus, "day");
  assert.equal(f.day.focused, 1);
});

test("removed editor launcher falls back to the matching rendered date", () => {
  const f = fixture();
  const editor = target();
  f.focus.remember("day", editor as unknown as HTMLElement, "2026-10-14");
  editor.isConnected = false;
  close(f.focus, "day");
  assert.equal(f.day.focused, 1);
});

test("hidden or disabled date falls back to keyboard-focusable calendar", () => {
  for (const field of ["hidden", "disabled"] as const) {
    const f = fixture();
    f.focus.remember("day", f.day as unknown as HTMLElement, "2026-10-14");
    f.day[field] = true;
    close(f.focus, "day");
    assert.equal(f.day.focused, 0);
    assert.equal(f.calendar.focused, 1);
  }
});

test("nested receipt restores inside its parent without consuming the date launcher", () => {
  const f = fixture();
  f.focus.remember("day", f.day as unknown as HTMLElement, "2026-10-14");
  f.state.parentOpen = true;
  f.focus.remember("receipt", f.receipt as unknown as HTMLElement);
  close(f.focus, "receipt");
  assert.equal(f.receipt.focused, 1);
  assert.equal(f.day.focused, 0);
  f.state.parentOpen = false;
  close(f.focus, "day");
  assert.equal(f.day.focused, 1);
});

test("removed receipt launcher falls back inside the open parent", () => {
  const f = fixture();
  f.state.parentOpen = true;
  f.focus.remember("receipt", f.receipt as unknown as HTMLElement);
  f.receipt.isConnected = false;
  close(f.focus, "receipt");
  assert.equal(f.region.focused, 1);
  assert.equal(f.calendar.focused, 0);
});

test("a different open modal or a concurrently closed parent cannot lose focus", () => {
  const f = fixture();
  f.focus.remember("day", f.day as unknown as HTMLElement, "2026-10-14");
  f.state.otherOpen = true;
  close(f.focus, "day");
  assert.equal(f.day.focused, 0);
  f.state.otherOpen = false;
  f.focus.remember("receipt", f.receipt as unknown as HTMLElement);
  close(f.focus, "receipt");
  assert.equal(f.receipt.focused, 0);
});

test("server rendering and detached page cleanup do not throw", () => {
  const focus = createCollectionDailyDialogFocus(() => null);
  focus.remember("day", null, "2026-10-14");
  close(focus, "day");
  const f = fixture();
  f.focus.remember("day", f.day as unknown as HTMLElement, "2026-10-14");
  f.day.isConnected = false;
  f.calendar.isConnected = false;
  close(f.focus, "day");
  assert.equal(f.day.focused + f.calendar.focused, 0);
});

test("the always-mounted model captures launchers before loading and pagination cannot replace them", () => {
  const model = readFileSync(new URL("../useCollectionDailyPageModel.ts", import.meta.url), "utf8");
  assert.match(model, /dialogFocus\.remember\("day", trigger, date\);\s*void data\.loadDayDetails\(date, 1\)/);
  assert.match(model, /dialogFocus\.remember\("receipt", trigger\);\s*data\.viewReceipt\(record, receiptId\)/);
  const pagination = model.slice(model.indexOf("const handleDialogPageChange"), model.indexOf("const handleSaveTarget"));
  assert.doesNotMatch(pagination, /dialogFocus\.remember/);
  assert.match(model, /onCloseAutoFocus: handleDayCloseAutoFocus/);
  assert.match(model, /\.\.\.data\.receiptPreviewDialogProps,\s*onCloseAutoFocus: handleReceiptCloseAutoFocus/);
  assert.match(model, /const canEditCalendar = role === "superuser" && userSelection\.canEditTarget/);
});
