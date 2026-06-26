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
        missingMonths: 0,
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
  assert.match(csv, /"1","Alpha, Primary","Rendah","1000\.00","1500\.00","Jauh daripada target","66\.7%","500\.00","4","250\.00","62\.5%"/);
  assert.match(csv, /"2","Beta","Sederhana"/);
  assert.match(csv, /"3","Gamma","Rendah"/);
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
  assert.doesNotMatch(source, /html2canvas/);
  assert.doesNotMatch(source, /document\.write/);
  assert.doesNotMatch(source, /innerHTML/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});
