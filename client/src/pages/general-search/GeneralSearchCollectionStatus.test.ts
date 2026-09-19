import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GeneralSearchCollectionStatus } from "./GeneralSearchCollectionStatus";

const recordedStatus = {
  state: "recorded",
  recordCount: 1,
  latestPaymentDate: "2026-08-04",
  latestCreatedAt: "2026-08-04T02:00:00.000Z",
  latestStaffNickname: "Collector Alpha",
  latestCreatedByLogin: "collector.login",
  latestAccountNumber: "ACC-1001",
  latestCardNumber: "4181000000003188",
  latestAmount: "125.50",
  sourceImportName: "NPL CC P10 JULY",
  sourceFilename: "npl-cc-p10-july.xlsx",
  matchBasis: "source_and_identifier",
};

test("collection status shows the Collection account in compact and detailed layouts", () => {
  const compactMarkup = renderToStaticMarkup(
    createElement(GeneralSearchCollectionStatus, {
      canSeeSourceFile: false,
      row: { _collectionStatus: recordedStatus },
    }),
  );
  const detailedMarkup = renderToStaticMarkup(
    createElement(GeneralSearchCollectionStatus, {
      canSeeSourceFile: true,
      row: { _collectionStatus: recordedStatus },
      showDetails: true,
    }),
  );

  assert.match(compactMarkup, /Akaun Collection:/);
  assert.match(compactMarkup, /ACC-1001/);
  assert.match(compactMarkup, /break-all/);
  assert.match(detailedMarkup, /Akaun Collection/);
  assert.match(detailedMarkup, /ACC-1001/);
  assert.equal((detailedMarkup.match(/ACC-1001/g) || []).length, 1);
  for (const markup of [compactMarkup, detailedMarkup]) {
    assert.match(markup, /Card No/);
    assert.match(markup, /4181000000003188/);
    assert.equal((markup.match(/4181000000003188/g) || []).length, 1);
  }
});

test("collection account content remains escaped when rendered", () => {
  const markup = renderToStaticMarkup(
    createElement(GeneralSearchCollectionStatus, {
      canSeeSourceFile: false,
      row: {
        _collectionStatus: {
          ...recordedStatus,
          latestAccountNumber: "<script>alert('xss')</script>",
        },
      },
    }),
  );

  assert.equal(markup.includes("<script>"), false);
  assert.equal(markup.includes("&lt;script&gt;"), true);
});

test("historical collection status is clearly separated from an active record", () => {
  const markup = renderToStaticMarkup(
    createElement(GeneralSearchCollectionStatus, {
      canSeeSourceFile: true,
      showDetails: true,
      row: {
        _collectionStatus: {
          ...recordedStatus,
          state: "historical",
          purgedAt: "2026-08-05T05:00:00.000Z",
          purgedBy: "superuser.audit",
        },
      },
    }),
  );

  assert.match(markup, /Rekod sejarah collection/);
  assert.match(markup, /Telah dipurge daripada rekod aktif/);
  assert.match(markup, /Dipurge pada/);
  assert.match(markup, /superuser\.audit/);
  assert.doesNotMatch(markup, />Collection direkodkan</);
  assert.match(markup, /Card No/);
  assert.match(markup, /4181000000003188/);
});

test("Card No uses only the matched Collection value and never guesses from the searched Saved row", () => {
  for (const state of ["recorded", "historical"]) {
    for (const showDetails of [false, true]) {
      for (const latestCardNumber of [undefined, null, "", "   ", { card: "WRONG-CARD" }, 123456]) {
        const markup = renderToStaticMarkup(createElement(GeneralSearchCollectionStatus, {
          canSeeSourceFile: false, showDetails,
          row: { "Card No": "UNRELATED-SOURCE-CARD", _collectionStatus: {
            ...recordedStatus, state, latestCardNumber,
          } },
        }));
        assert.match(markup, /Card No/);
        assert.match(markup, /Tidak dinyatakan/);
        assert.match(markup, /ACC-1001/);
        assert.doesNotMatch(markup, /UNRELATED-SOURCE-CARD|WRONG-CARD|undefined|\[object Object\]|npl-cc-p10/);
      }
    }
  }
});

test("Card No preserves established full/masked text and escapes markup without showing cards in absent/denied statuses", () => {
  for (const latestCardNumber of ["  4181XXXXXXXX3188  ", "<script>bad-card</script>"]) {
    const markup = renderToStaticMarkup(createElement(GeneralSearchCollectionStatus, {
      canSeeSourceFile: false,
      row: { _collectionStatus: { ...recordedStatus, latestCardNumber } },
    }));
    assert.doesNotMatch(markup, /<script>/);
    assert.ok(markup.includes(latestCardNumber.includes("<") ? "&lt;script&gt;" : "4181XXXXXXXX3188"));
  }
  for (const state of ["not_recorded", "unavailable"]) {
    const markup = renderToStaticMarkup(createElement(GeneralSearchCollectionStatus, {
      canSeeSourceFile: false,
      row: { _collectionStatus: { ...recordedStatus, state } },
    }));
    assert.doesNotMatch(markup, /Card No|4181000000003188/);
  }
});
