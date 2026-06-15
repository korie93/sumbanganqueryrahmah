import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionNicknameSummaryChart } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChart";

test("CollectionNicknameSummaryChart exposes an accessible full-view action", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionNicknameSummaryChart, {
      fromDate: "2026-06-01",
      toDate: "2026-06-15",
      nicknameTotals: [
        { nickname: "Collector Alpha", totalAmount: 750, totalRecords: 3 },
      ],
      totalAmount: 750,
      totalRecords: 3,
    }),
  );

  assert.match(markup, /Paparan penuh/);
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, /Buka graf nickname summary dalam paparan penuh/);
});

test("CollectionNicknameSummaryChart full view restores focus without manual lifecycle listeners", () => {
  const source = readFileSync(
    new URL("./CollectionNicknameSummaryChart.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /data-testid="dialog-nickname-summary-chart-detail"/);
  assert.match(source, /displayMode="detail"/);
  assert.match(source, /onCloseAutoFocus=\{handleFullViewCloseAutoFocus\}/);
  assert.match(source, /fullViewTriggerRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(source, /useEffect\(/);
  assert.doesNotMatch(source, /setTimeout\(/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.doesNotMatch(source, /addEventListener\(/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});
