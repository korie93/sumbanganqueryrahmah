import assert from "node:assert/strict";
import test from "node:test";
import type { DataRow } from "../../../shared/schema-postgres";
import {
  buildImportCustomerComparisonPage,
  collectImportComparisonDataset,
  ImportComparisonBusyError,
  ImportComparisonLimitError,
  runWithImportComparisonCapacity,
} from "../import-customer-comparison";

function row(
  id: string,
  importId: string,
  jsonDataJsonb: Record<string, unknown>,
): DataRow {
  return { id, importId, jsonDataJsonb };
}

async function collect(importId: string, rows: DataRow[]) {
  return collectImportComparisonDataset({
    importId,
    expectedRowCount: rows.length,
    loadPage: async (_requestedImportId, limit, afterRowId) => {
      const available = afterRowId
        ? rows.filter((item) => item.id > afterRowId)
        : rows;
      return available.slice(0, limit);
    },
  });
}

test("customer comparison classifies matches, account changes, conflicts, and file-only identities", async () => {
  const baseline = await collect("baseline", [
    row("b-1", "baseline", {
      "Customer Name": "Alice Tan",
      "IC Number": "900101101234",
      "Account No": "A-100",
    }),
    row("b-2", "baseline", {
      "Customer Name": "Alice Tan",
      "IC Number": "900101101234",
      "Account No": "A100",
    }),
    row("b-3", "baseline", {
      "Customer Name": "Bob Lim",
      "IC Number": "800202021111",
      "Account No": "B100",
    }),
    row("b-4", "baseline", {
      "Customer Name": "Carol Lee",
      "IC Number": "700303031111",
      "Account No": "C100",
    }),
    row("b-5", "baseline", {
      "Customer Name": "Old Owner",
      "IC Number": "600404041111",
      "Account No": "X100",
    }),
    row("b-6", "baseline", { "Customer Name": "Needs Review" }),
    row("b-7", "baseline", {
      "Customer Name": "Eve Low",
      "IC Number": "650606061111",
      "Account No": "E100",
    }),
  ]);
  const current = await collect("current", [
    row("c-1", "current", {
      "Customer Name": "Alice Tan",
      "IC Number": "900101101234",
      "Account No": "A100",
    }),
    row("c-2", "current", {
      "Customer Name": "Bob Lim",
      "IC Number": "800202021111",
      "Account No": "B200",
    }),
    row("c-3", "current", {
      "Customer Name": "Dave Ong",
      "IC Number": "750505051111",
      "Account No": "D100",
    }),
    row("c-4", "current", {
      "Customer Name": "New Owner",
      "IC Number": "610404041111",
      "Account No": "X100",
    }),
    row("c-5", "current", { "Customer Name": "Also Needs Review" }),
    row("c-6", "current", {
      "Customer Name": "Alice Tan",
      "IC Number": "900101101234",
      "Account No": "A200",
    }),
    row("c-7", "current", {
      "Customer Name": "Eve Low",
      "IC Number": "650606061111",
      "Account No": "E100",
    }),
  ]);

  const result = buildImportCustomerComparisonPage({
    baseline,
    current,
    category: "all",
    search: "",
    page: 1,
    pageSize: 25,
  });

  assert.deepEqual(result.summary, {
    baselineIdentities: 6,
    currentIdentities: 6,
    matched: 1,
    accountChanged: 2,
    baselineOnly: 1,
    currentOnly: 1,
    conflicts: 1,
    unidentified: 2,
    baselineDuplicateRows: 1,
    currentDuplicateRows: 1,
  });
  assert.equal(result.pagination.total, 8);
  assert.equal(
    result.items.find((item) => item.current?.customerName === "Alice Tan")
      ?.category,
    "account_changed",
  );
  assert.equal(
    result.items.find((item) => item.category === "conflict")?.matchBasis,
    "account",
  );
});

test("customer comparison applies category, search, and bounded pagination after matching", async () => {
  const baseline = await collect("baseline", [
    row("b-1", "baseline", {
      Name: "Nur Aina",
      NRIC: "910101101234",
      AccountNumber: "ACC001",
    }),
  ]);
  const current = await collect("current", [
    row("c-1", "current", {
      Name: "Nur Aina",
      NRIC: "910101101234",
      AccountNumber: "ACC002",
    }),
    row("c-2", "current", {
      Name: "Other Customer",
      NRIC: "920202021234",
      AccountNumber: "ACC003",
    }),
  ]);

  const result = buildImportCustomerComparisonPage({
    baseline,
    current,
    category: "account_changed",
    search: "910101",
    page: 99,
    pageSize: 10,
  });

  assert.equal(result.pagination.page, 1);
  assert.equal(result.pagination.total, 1);
  assert.equal(result.items[0]?.category, "account_changed");
  assert.equal(result.items[0]?.baseline?.customerName, "Nur Aina");
});

test("customer comparison uses phone and name when only one side has an IC", async () => {
  const baseline = await collect("baseline", [
    row("b-1", "baseline", {
      Name: "Siti Aminah",
      Phone: "012-345 6789",
      AccountNumber: "OLD100",
    }),
  ]);
  const current = await collect("current", [
    row("c-1", "current", {
      Name: "Siti Aminah",
      Phone: "+60123456789",
      NRIC: "900101101234",
      AccountNumber: "NEW100",
    }),
  ]);

  const result = buildImportCustomerComparisonPage({
    baseline,
    current,
    category: "all",
    search: "",
    page: 1,
    pageSize: 10,
  });

  assert.equal(result.pagination.total, 1);
  assert.equal(result.items[0]?.category, "account_changed");
  assert.equal(result.items[0]?.matchBasis, "phone_and_name");
});

test("customer comparison treats conflicting names on an account-only match as a conflict", async () => {
  const baseline = await collect("baseline", [
    row("b-1", "baseline", { Name: "First Owner", AccountNumber: "ACC100" }),
  ]);
  const current = await collect("current", [
    row("c-1", "current", { Name: "Second Owner", AccountNumber: "ACC100" }),
  ]);

  const result = buildImportCustomerComparisonPage({
    baseline,
    current,
    category: "all",
    search: "",
    page: 1,
    pageSize: 10,
  });

  assert.equal(result.pagination.total, 1);
  assert.equal(result.items[0]?.category, "conflict");
  assert.equal(result.items[0]?.matchBasis, "account");
});

test("customer comparison rejects oversized files before loading row data", async () => {
  let loadCalls = 0;

  await assert.rejects(
    () => collectImportComparisonDataset({
      importId: "too-large",
      expectedRowCount: 100_001,
      loadPage: async () => {
        loadCalls += 1;
        return [];
      },
    }),
    ImportComparisonLimitError,
  );
  assert.equal(loadCalls, 0);
});

test("customer comparison stops chunk traversal when the request is aborted", async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () => collectImportComparisonDataset({
      importId: "aborted",
      expectedRowCount: 1,
      signal: controller.signal,
      loadPage: async () => [],
    }),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});

test("customer comparison bounds concurrent work and releases capacity", async () => {
  let releaseFirst: (() => void) | undefined;
  const first = runWithImportComparisonCapacity(() => new Promise<void>((resolve) => {
    releaseFirst = resolve;
  }));

  await assert.rejects(
    () => runWithImportComparisonCapacity(async () => undefined),
    ImportComparisonBusyError,
  );

  releaseFirst?.();
  await first;
  await assert.doesNotReject(
    () => runWithImportComparisonCapacity(async () => undefined),
  );
});
