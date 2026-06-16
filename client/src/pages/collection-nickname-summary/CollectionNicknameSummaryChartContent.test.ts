import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionNicknameSummaryChartContent } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartContent";
import { CollectionNicknameSummaryRankingTable } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartDetails";

test("CollectionNicknameSummaryChartContent renders accessible chart context from table totals", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionNicknameSummaryChartContent, {
      nicknameTotals: [
        {
          nickname: "Collector Alpha With A Long Nickname",
          totalAmount: 750,
          totalRecords: 3,
        },
        { nickname: "Collector Beta", totalAmount: 250, totalRecords: 1 },
      ],
      totalAmount: 1_000,
      totalRecords: 4,
    }),
  );

  assert.match(markup, /role="region"/);
  assert.match(markup, /role="img"/);
  assert.match(markup, /Nickname summary bar chart for 2 nicknames/);
  assert.match(markup, /Jumlah kutipan/);
  assert.match(markup, /Kutipan tertinggi/);
  assert.match(markup, /Nickname summary chart data/);
  assert.match(markup, /Collector Alpha With A Long Nickname/);
  assert.match(markup, /75\.0% of total/);
  assert.match(markup, /tabindex="0"/);
  assert.match(markup, /min-width:260px/);
});

test("CollectionNicknameSummaryChartContent renders detailed ranking and averages", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionNicknameSummaryChartContent, {
      nicknameTotals: [
        { nickname: "Collector Beta", totalAmount: 250, totalRecords: 1 },
        { nickname: "Collector Alpha", totalAmount: 750, totalRecords: 3 },
      ],
      totalAmount: 1_000,
      totalRecords: 4,
      displayMode: "detail",
    }),
  );

  assert.match(markup, /Purata setiap rekod/);
  assert.match(markup, /Perbandingan kutipan/);
  assert.match(markup, /Ranking terperinci/);
  assert.match(markup, /Penapis paparan/);
  assert.match(markup, /Cari nickname/);
  assert.match(markup, /Target per nickname \(RM\)/);
  assert.match(markup, /Susun mengikut/);
  assert.match(markup, /Bilangan paparan/);
  assert.match(markup, /Prestasi relatif/);
  assert.match(markup, /Tinggi/);
  assert.match(markup, /Sederhana/);
  assert.match(markup, /Rendah/);
  assert.match(markup, /Eksport/);
  assert.match(markup, /Nickname summary detailed ranking/);
  assert.match(markup, /Nickname summary compact ranking/);
  assert.match(markup, /Lihat rekod/);
  assert.match(markup, /Disusun daripada jumlah kutipan tertinggi kepada terendah/);
  assert.ok(markup.indexOf("Collector Alpha") < markup.lastIndexOf("Collector Beta"));
  assert.match(markup, /RM(?:&nbsp;|\u00a0| )250\.00/);
  assert.match(markup, /75\.0%/);
  assert.match(markup, /h-\[clamp\(360px,54vh,620px\)\]/);
});

test("CollectionNicknameSummaryChartContent renders explicit empty and zero states", () => {
  const emptyMarkup = renderToStaticMarkup(
    createElement(CollectionNicknameSummaryChartContent, {
      nicknameTotals: [],
      totalAmount: 0,
      totalRecords: 0,
    }),
  );
  assert.match(emptyMarkup, /role="status"/);
  assert.match(emptyMarkup, /No nickname collection data/);
  assert.doesNotMatch(emptyMarkup, /role="img"/);

  const zeroMarkup = renderToStaticMarkup(
    createElement(CollectionNicknameSummaryChartContent, {
      nicknameTotals: [
        { nickname: "Collector Alpha", totalAmount: 0, totalRecords: 2 },
      ],
      totalAmount: 0,
      totalRecords: 2,
    }),
  );
  assert.match(zeroMarkup, /No collection amount to chart/);
  assert.match(zeroMarkup, /2 record\(s\)/);
  assert.doesNotMatch(zeroMarkup, /role="img"/);
});

test("CollectionNicknameSummaryRankingTable describes the active sort", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionNicknameSummaryRankingTable, {
      benchmarkAmount: 100,
      onSelectNickname: () => undefined,
      peakAmount: 100,
      rankedData: [
        {
          key: "collector-alpha",
          nickname: "Collector Alpha",
          axisLabel: "Collector Alpha",
          totalAmount: 100,
          totalRecords: 4,
          averagePerRecord: 25,
          percentage: 100,
          hasAmount: true,
          color: "hsl(var(--chart-1))",
        },
      ],
      sortBy: "records",
    }),
  );

  assert.match(markup, /Disusun daripada jumlah rekod tertinggi kepada terendah/);
  assert.match(markup, /Capai target/);
  assert.match(markup, /Lihat rekod/);
});
