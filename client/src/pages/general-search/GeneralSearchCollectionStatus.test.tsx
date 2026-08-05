import assert from "node:assert/strict";
import test from "node:test";
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
  latestAmount: "125.50",
  sourceImportName: "NPL CC P10 JULY",
  sourceFilename: "npl-cc-p10-july.xlsx",
  matchBasis: "source_and_identifier",
};

test("collection status shows the Collection account in compact and detailed layouts", () => {
  const compactMarkup = renderToStaticMarkup(
    <GeneralSearchCollectionStatus
      canSeeSourceFile={false}
      row={{ _collectionStatus: recordedStatus }}
    />,
  );
  const detailedMarkup = renderToStaticMarkup(
    <GeneralSearchCollectionStatus
      canSeeSourceFile
      row={{ _collectionStatus: recordedStatus }}
      showDetails
    />,
  );

  assert.match(compactMarkup, /Akaun Collection:/);
  assert.match(compactMarkup, /ACC-1001/);
  assert.match(compactMarkup, /break-all/);
  assert.match(detailedMarkup, /Akaun Collection/);
  assert.match(detailedMarkup, /ACC-1001/);
  assert.equal((detailedMarkup.match(/ACC-1001/g) || []).length, 1);
});

test("collection account content remains escaped when rendered", () => {
  const markup = renderToStaticMarkup(
    <GeneralSearchCollectionStatus
      canSeeSourceFile={false}
      row={{
        _collectionStatus: {
          ...recordedStatus,
          latestAccountNumber: "<script>alert('xss')</script>",
        },
      }}
    />,
  );

  assert.equal(markup.includes("<script>"), false);
  assert.equal(markup.includes("&lt;script&gt;"), true);
});

test("historical collection status is clearly separated from an active record", () => {
  const markup = renderToStaticMarkup(
    <GeneralSearchCollectionStatus
      canSeeSourceFile
      showDetails
      row={{
        _collectionStatus: {
          ...recordedStatus,
          state: "historical",
          purgedAt: "2026-08-05T05:00:00.000Z",
          purgedBy: "superuser.audit",
        },
      }}
    />,
  );

  assert.match(markup, /Rekod sejarah collection/);
  assert.match(markup, /Telah dipurge daripada rekod aktif/);
  assert.match(markup, /Dipurge pada/);
  assert.match(markup, /superuser\.audit/);
  assert.doesNotMatch(markup, />Collection direkodkan</);
});
