import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionRecordsFilters } from "@/pages/collection-records/CollectionRecordsFilters";

test("CollectionRecordsFilters uses the collection nickname picker and compact desktop controls", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionRecordsFilters, {
      canUseNicknameFilter: true,
      fromDate: "2026-05-01",
      toDate: "2026-05-15",
      searchInput: "afiqah",
      nicknameFilter: "all",
      sourceImportFilter: "all",
      agingFilter: "all",
      classificationFilter: "all",
      sortValue: "paymentDate_desc",
      nicknameOptions: [
        { id: "1", nickname: "SW.AFIQAH_1332", isActive: true, roleScope: "both", createdBy: null, createdAt: "2026-05-01T00:00:00.000Z" },
        { id: "2", nickname: "SW.HAZIQ_1042", isActive: true, roleScope: "both", createdBy: null, createdAt: "2026-05-01T00:00:00.000Z" },
      ],
      sourceOptions: [{
        sourceImportId: "source-1",
        sourceImportName: "P10 September",
        sourceFilename: "p10-september.xlsb",
        rowCount: 1511,
        validFrom: "2026-09-01",
        validTo: "2026-09-30",
        cycleKey: "2026-09",
        enabled: true,
        compatibilityStatus: "compatible",
        compatibilityIssues: [],
        indexedRowCount: 1511,
        configuredBy: "superuser",
        configuredAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        status: "active",
      }],
      loadingNicknames: false,
      loadingSources: false,
      loadingRecords: false,
      onFromDateChange: () => undefined,
      onToDateChange: () => undefined,
      onSearchInputChange: () => undefined,
      onNicknameFilterChange: () => undefined,
      onSourceImportFilterChange: () => undefined,
      onAgingFilterChange: () => undefined,
      onClassificationFilterChange: () => undefined,
      onSortValueChange: () => undefined,
      onFilter: () => undefined,
      onReset: () => undefined,
    }),
  );

  assert.match(markup, /id="collection-records-nickname-filter"/);
  assert.match(markup, /id="collection-records-source-desktop"/);
  assert.match(markup, /id="collection-records-aging-desktop"/);
  assert.match(markup, /id="collection-records-classification-desktop"/);
  assert.match(markup, /id="collection-records-sort-desktop"/);
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, />Semua staff</);
  assert.match(markup, /h-11 rounded-xl bg-background/);
  assert.match(markup, />Filter</);
  assert.match(markup, />Reset</);
  assert.doesNotMatch(markup, /<select[^>]*collection-records-nickname-filter/);
});
