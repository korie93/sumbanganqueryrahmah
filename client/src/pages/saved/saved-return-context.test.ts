import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSavedReturnDate,
  normalizeSavedReturnContext,
  parseSavedReturnDate,
  type SavedReturnContext,
} from "@/pages/saved/saved-return-context";

function context(): SavedReturnContext {
  return {
    query: { page: 3, pageSize: 30, searchTerm: " Batch P10 ", uploaderFilter: "synthetic.user",
      createdOn: "2026-10-28", minRowsFilter: "0005", maxRowsFilter: "not yet valid",
      workspaceView: "recent" },
    importId: "synthetic-file-17",
    scroll: { windowX: 0, windowY: 480.5, listLeft: 50.25, listTop: 723.75 },
  };
}

test("Saved return context preserves raw UI values and clones only bounded navigation metadata", () => {
  const source = { ...context(), rows: [{ private: "must not be retained" }],
    selectedImportIds: ["other-file"], arbitrary: { large: true } };
  Object.assign(source.query, { rows: [{ ignored: true }], authToken: "synthetic-ignored" });
  Object.assign(source.scroll, { extra: [1, 2, 3] });
  const result = normalizeSavedReturnContext(source);
  assert.deepEqual(result, context());
  assert.notEqual(result, source);
  assert.notEqual(result!.query, source.query);
  assert.notEqual(result!.scroll, source.scroll);
  source.query.searchTerm = "changed after capture";
  source.scroll.listTop = 0;
  assert.equal(result!.query.searchTerm, " Batch P10 ");
  assert.equal(result!.scroll.listTop, 723.75);
});

test("Saved return context accepts standard pagination and each existing workspace view", () => {
  for (const pageSize of [10, 20, 30, 40, 50]) {
    for (const workspaceView of ["all", "recent", "large", "duplicates", "review"] as const) {
      const value = context();
      Object.assign(value.query, { pageSize, workspaceView, createdOn: undefined });
      const result = normalizeSavedReturnContext(value);
      assert.ok(result);
      assert.equal(result.query.pageSize, pageSize);
      assert.equal(result.query.workspaceView, workspaceView);
      assert.equal(Object.prototype.hasOwnProperty.call(result.query, "createdOn"), false);
    }
  }
});

test("Saved return context rejects missing, inherited, array and custom-prototype inputs", () => {
  const full = context();
  for (const value of [null, undefined, 0, "", [], {}, Object.create(full),
    { ...full, query: Object.create(full.query) }, { ...full, scroll: Object.create(full.scroll) },
    { ...full, query: [] }, { ...full, scroll: [] }, { ...full, importId: "" },
    { ...full, importId: "   " }, { ...full, importId: "invalid\u0000id" },
    { ...full, importId: "x".repeat(257) }]) {
    assert.equal(normalizeSavedReturnContext(value), null);
  }
  const withoutPrototype = Object.assign(Object.create(null), context());
  assert.deepEqual(normalizeSavedReturnContext(withoutPrototype), context());
});

test("Saved return context rejects accessors without evaluating them", () => {
  let evaluations = 0;
  for (const field of ["importId", "query", "scroll"] as const) {
    const value = context();
    Object.defineProperty(value, field, { get() { evaluations += 1; return "unexpected"; } });
    assert.equal(normalizeSavedReturnContext(value), null);
  }
  for (const field of ["searchTerm", "createdOn"] as const) {
    const value = context();
    Object.defineProperty(value.query, field, { get() { evaluations += 1; return "unexpected"; } });
    assert.equal(normalizeSavedReturnContext(value), null);
  }
  assert.equal(evaluations, 0);
});

test("Saved return context rejects unbounded or invalid pagination, text, dates and workspace values", () => {
  const invalidQueryPatches = [
    { page: 0 }, { page: -1 }, { page: 1.5 }, { page: Number.NaN }, { page: Number.POSITIVE_INFINITY },
    { page: 1_000_001 }, { pageSize: 25 }, { pageSize: 500 }, { pageSize: "20" },
    { searchTerm: "x".repeat(2049) }, { uploaderFilter: null }, { minRowsFilter: 5 },
    { maxRowsFilter: [] }, { createdOn: "2026-02-29" }, { createdOn: "2026-10-28T00:00:00Z" },
    { createdOn: "" }, { workspaceView: "unknown" },
  ];
  for (const patch of invalidQueryPatches) {
    const value = context();
    Object.assign(value.query, patch);
    assert.equal(normalizeSavedReturnContext(value), null, JSON.stringify(patch));
  }
  const boundary = context();
  Object.assign(boundary.query, { page: 1_000_000, searchTerm: "x".repeat(2048) });
  assert.ok(normalizeSavedReturnContext(boundary));
});

test("Saved return context accepts finite fractional scroll positions and rejects invalid offsets", () => {
  for (const field of ["windowX", "windowY", "listLeft", "listTop"] as const) {
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY, 10_000_001, "100", null]) {
      const value = context();
      Object.assign(value.scroll, { [field]: invalid });
      assert.equal(normalizeSavedReturnContext(value), null, field);
    }
    const value = context();
    value.scroll[field] = 10_000_000;
    assert.equal(normalizeSavedReturnContext(value)?.scroll[field], 10_000_000);
  }
});

test("Saved return dates validate local calendar days instead of normalizing impossible dates", () => {
  for (const day of ["2024-02-29", "2000-02-29", "2026-10-28", "0099-01-02"]) {
    const date = parseSavedReturnDate(day);
    assert.ok(date, day);
    assert.equal(formatSavedReturnDate(date), day);
    assert.equal(date.getHours(), 0);
    assert.equal(date.getMinutes(), 0);
  }
  for (const day of ["2026-02-29", "1900-02-29", "2026-04-31", "2026-13-01", "2026-00-01",
    "2026-01-00", "0000-01-01", "2026-1-01", "28/10/2026", "2026-10-28T00:00:00Z", ""]) {
    assert.equal(parseSavedReturnDate(day), undefined, day);
  }
  assert.equal(parseSavedReturnDate(), undefined);
  assert.equal(formatSavedReturnDate(), undefined);
  assert.equal(formatSavedReturnDate(new Date(Number.NaN)), undefined);
  const local = new Date(2026, 9, 28, 23, 45);
  assert.equal(formatSavedReturnDate(local), "2026-10-28");
});
