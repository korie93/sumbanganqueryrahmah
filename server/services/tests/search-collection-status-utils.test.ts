import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSearchCollectionStatusCandidates,
  buildSearchCollectionStatuses,
} from "../search-collection-status-utils";
import { MAX_SEARCH_COLLECTION_STATUS_CANDIDATES } from "../../repositories/search-repository-types";

test("search collection status candidates normalize recognized IC, phone, and account columns", () => {
  const candidates = buildSearchCollectionStatusCandidates([
    {
      id: "row-1",
      importId: "import-1",
      jsonDataJsonb: {
        "No. KP": "900101-10-1234",
        "No Telefon": "+60 12-345 6789",
        "Account No": " ACC 1001 ",
      },
    },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.rowId, "row-1");
  assert.equal(candidates[0]?.sourceImportId, "import-1");
  assert.equal(candidates[0]?.icValue, "900101101234");
  assert.equal(candidates[0]?.phoneValue, "0123456789");
  assert.equal(candidates[0]?.accountValue, "ACC1001");
});

test("search collection statuses distinguish recorded, missing, and unverifiable rows while redacting details", () => {
  const rows = [
    { id: "row-1", importId: "import-1", jsonDataJsonb: { IC: "900101101234" } },
    { id: "row-2", importId: "import-1", jsonDataJsonb: { Phone: "0123456789" } },
    { id: "row-3", importId: "import-1", jsonDataJsonb: { Name: "Alice" } },
  ];
  const candidates = buildSearchCollectionStatusCandidates(rows);
  const statuses = buildSearchCollectionStatuses({
    rows,
    candidates,
    matches: [{
      rowId: "row-1",
      recordCount: 2,
      latestPaymentDate: "2026-08-01",
      latestCreatedAt: "2026-08-01T08:00:00.000Z",
      latestStaffNickname: "Collector Alpha",
      sourceImportName: "NPL CC P10 JULY",
      sourceFilename: "npl.xlsx",
      matchBasis: "source_and_identifier",
    }],
    includeSensitiveDetails: false,
  });

  assert.equal(statuses.get("row-1")?.state, "recorded");
  assert.equal(statuses.get("row-1")?.recordCount, 2);
  assert.equal(statuses.get("row-1")?.latestStaffNickname, null);
  assert.equal(statuses.get("row-1")?.sourceImportName, null);
  assert.equal(statuses.get("row-2")?.state, "not_recorded");
  assert.equal(statuses.get("row-3")?.state, "unavailable");
});

test("search collection status candidates stay bounded without creating false missing statuses", () => {
  const rows = Array.from(
    { length: MAX_SEARCH_COLLECTION_STATUS_CANDIDATES + 1 },
    (_, index) => ({
      id: `row-${index}`,
      importId: "import-1",
      jsonDataJsonb: { "IC Number": `90010101${String(index).padStart(4, "0")}` },
    }),
  );

  const candidates = buildSearchCollectionStatusCandidates(rows);
  const statuses = buildSearchCollectionStatuses({
    rows,
    candidates,
    matches: [],
    includeSensitiveDetails: false,
  });

  assert.equal(candidates.length, MAX_SEARCH_COLLECTION_STATUS_CANDIDATES);
  assert.equal(statuses.get("row-199")?.state, "not_recorded");
  assert.equal(statuses.get("row-200")?.state, "unavailable");
});
