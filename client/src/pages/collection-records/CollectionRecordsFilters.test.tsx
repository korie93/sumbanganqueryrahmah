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
      nicknameOptions: [
        { id: "1", nickname: "SW.AFIQAH_1332", isActive: true, roleScope: "both", createdBy: null, createdAt: "2026-05-01T00:00:00.000Z" },
        { id: "2", nickname: "SW.HAZIQ_1042", isActive: true, roleScope: "both", createdBy: null, createdAt: "2026-05-01T00:00:00.000Z" },
      ],
      loadingNicknames: false,
      loadingRecords: false,
      onFromDateChange: () => undefined,
      onToDateChange: () => undefined,
      onSearchInputChange: () => undefined,
      onNicknameFilterChange: () => undefined,
      onFilter: () => undefined,
      onReset: () => undefined,
    }),
  );

  assert.match(markup, /id="collection-records-nickname-filter"/);
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, />Semua staff</);
  assert.match(markup, /h-11 rounded-xl bg-background/);
  assert.match(markup, />Filter</);
  assert.match(markup, />Reset</);
  assert.doesNotMatch(markup, /<select[^>]*collection-records-nickname-filter/);
});
