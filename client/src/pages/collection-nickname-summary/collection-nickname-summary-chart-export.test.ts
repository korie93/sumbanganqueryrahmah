import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildCollectionNicknameSummaryChartData } from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import { buildCollectionNicknameSummaryCsvContent } from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-export";
import {
  normalizeCollectionNicknameTargetKey,
  type CollectionNicknameTargetBenchmark,
} from "@/pages/collection-nickname-summary/collection-nickname-target-benchmarks";

test("nickname summary CSV export includes target-aware ranking, performance labels, and safely quoted nicknames", () => {
  const rows = buildCollectionNicknameSummaryChartData([
    { nickname: "Alpha, Primary", totalAmount: 1_000, totalRecords: 4 },
    { nickname: "Beta", totalAmount: 500, totalRecords: 2 },
    { nickname: "Gamma", totalAmount: 100, totalRecords: 1 },
  ], 1_600);
  const targetBenchmarks = new Map<string, CollectionNicknameTargetBenchmark>([
    [
      normalizeCollectionNicknameTargetKey("Alpha, Primary"),
      {
        amount: 1_500,
        configuredMonths: 1,
        latestUpdatedAt: "2026-06-20T01:02:03.000Z",
        latestUpdatedBy: "superuser",
        missingMonths: 0,
        months: [{
          amount: 1_500,
          configured: true,
          month: "2026-06",
          updatedAt: "2026-06-20T01:02:03.000Z",
          updatedBy: "superuser",
        }],
        requestedMonths: 1,
      },
    ],
  ]);

  const csv = buildCollectionNicknameSummaryCsvContent(rows, {
    targetBenchmarks,
    totalAmount: 1_600,
    totalRecords: 7,
  });

  assert.match(csv, /"Rank","Nickname","Prestasi","Jumlah Kutipan \(MYR\)","Target \(MYR\)","Status Target"/);
  assert.match(csv, /"Pecahan Bulan Target","Bulan Tanpa Target","Target Dikemas Kini Oleh","Target Dikemas Kini Pada"/);
  assert.match(csv, /"1","Alpha, Primary","Rendah","1000\.00","1500\.00","Jauh daripada target","66\.7%","500\.00","2026-06=1500\.00","","superuser","2026-06-20T01:02:03\.000Z","4","250\.00","62\.5%"/);
  assert.match(csv, /"2","Beta","Sederhana"/);
  assert.match(csv, /"3","Gamma","Rendah"/);
});

test("nickname summary CSV export preserves the full configured monthly target", () => {
  const rows = buildCollectionNicknameSummaryChartData([
    { nickname: "Collector Alpha", totalAmount: 30_000, totalRecords: 10 },
  ], 30_000);
  const targetBenchmarks = new Map<string, CollectionNicknameTargetBenchmark>([
    [
      normalizeCollectionNicknameTargetKey("Collector Alpha"),
      {
        amount: 60_000,
        configuredMonths: 1,
        latestUpdatedAt: null,
        latestUpdatedBy: null,
        missingMonths: 0,
        months: [],
        requestedMonths: 1,
      },
    ],
  ]);

  const csv = buildCollectionNicknameSummaryCsvContent(rows, {
    targetBenchmarks,
    totalAmount: 30_000,
    totalRecords: 10,
  });

  assert.match(
    csv,
    /"1","Collector Alpha","Rendah","30000\.00","60000\.00","Jauh daripada target","50\.0%","30000\.00"/,
  );
});

test("nickname summary CSV marks partial target ranges as incomplete", () => {
  const rows = buildCollectionNicknameSummaryChartData([
    { nickname: "Collector Alpha", totalAmount: 70_000, totalRecords: 10 },
  ], 70_000);
  const targetBenchmarks = new Map<string, CollectionNicknameTargetBenchmark>([[
    normalizeCollectionNicknameTargetKey("Collector Alpha"),
    {
      amount: 60_000,
      configuredMonths: 1,
      latestUpdatedAt: "2026-06-20T01:02:03.000Z",
      latestUpdatedBy: "superuser",
      missingMonths: 1,
      months: [
        {
          amount: 60_000,
          configured: true,
          month: "2026-06",
          updatedAt: "2026-06-20T01:02:03.000Z",
          updatedBy: "superuser",
        },
        {
          amount: 0,
          configured: false,
          month: "2026-07",
          updatedAt: null,
          updatedBy: null,
        },
      ],
      requestedMonths: 2,
    },
  ]]);

  const csv = buildCollectionNicknameSummaryCsvContent(rows, {
    targetBenchmarks,
    totalAmount: 70_000,
    totalRecords: 10,
  });

  assert.match(csv, /"Target tidak lengkap","","","2026-06=60000\.00; 2026-07=TIADA","2026-07"/);
  assert.doesNotMatch(csv, /"Capai target"/);
});

test("nickname summary image and PDF exports avoid HTML capture and release canvas memory", () => {
  const source = readFileSync(
    new URL("./collection-nickname-summary-chart-export.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /downloadBlob\(pdf\.output\("blob"\)/);
  assert.match(source, /canvas\.toBlob/);
  assert.match(source, /canvas\.width = 1/);
  assert.match(source, /canvas\.height = 1/);
  assert.match(source, /import\("jspdf"\)/);
  assert.match(source, /TARGET_EXPORT_STROKE = "#b91c1c"/);
  assert.match(source, /drawing\.strokeStyle = TARGET_EXPORT_STROKE/);
  assert.match(source, /pdf\.setDrawColor\(185, 28, 28\)/);
  assert.doesNotMatch(source, /html2canvas/);
  assert.doesNotMatch(source, /document\.write/);
  assert.doesNotMatch(source, /innerHTML/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});
