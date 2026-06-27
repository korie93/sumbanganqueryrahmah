import type { CollectionNicknameSummaryChartDatum } from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import {
  getCollectionNicknameTargetBenchmark,
  isCollectionNicknameTargetBenchmarkComplete,
  type CollectionNicknameTargetBenchmark,
} from "@/pages/collection-nickname-summary/collection-nickname-target-benchmarks";
import { buildCollectionNicknameTargetMonthExportText } from "@/pages/collection-nickname-summary/collection-nickname-target-audit";

type JsPdfDocument = InstanceType<typeof import("jspdf")["default"]>;

export function appendCollectionNicknameTargetAuditPages({
  drawPageBase,
  margin,
  pageHeight,
  pageNumber: initialPageNumber,
  pdf,
  rows,
  targetBenchmarks,
  truncateText,
}: {
  drawPageBase: (pageNumber: number) => void;
  margin: number;
  pageHeight: number;
  pageNumber: number;
  pdf: JsPdfDocument;
  rows: readonly CollectionNicknameSummaryChartDatum[];
  targetBenchmarks?: ReadonlyMap<string, CollectionNicknameTargetBenchmark> | undefined;
  truncateText: (value: string, maxLength: number) => string;
}): number {
  const targetAuditRows = rows
    .map((row) => ({
      benchmark: getCollectionNicknameTargetBenchmark(targetBenchmarks, row.nickname),
      row,
    }))
    .filter(({ benchmark }) => benchmark.requestedMonths > 0);
  if (targetAuditRows.length === 0) {
    return initialPageNumber;
  }

  let pageNumber = initialPageNumber + 1;
  let y = 28;
  pdf.addPage();
  drawPageBase(pageNumber);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Audit target mengikut bulan", margin, y);
  y += 8;

  targetAuditRows.forEach(({ benchmark, row }) => {
    if (y + 16 > pageHeight - 13) {
      pdf.addPage();
      pageNumber += 1;
      drawPageBase(pageNumber);
      y = 25;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(15, 23, 42);
    pdf.text(truncateText(row.nickname, 45), margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.2);
    pdf.setTextColor(71, 85, 105);
    const statusText = isCollectionNicknameTargetBenchmarkComplete(benchmark)
      ? "Lengkap"
      : `Tidak lengkap (${benchmark.configuredMonths}/${benchmark.requestedMonths} bulan)`;
    pdf.text(`Status: ${statusText}`, 75, y);
    pdf.text(
      `Dikemas kini: ${truncateText(benchmark.latestUpdatedBy || "Tidak direkodkan", 28)} | ${benchmark.latestUpdatedAt || "Tidak direkodkan"}`,
      135,
      y,
    );
    y += 5;
    pdf.text(
      truncateText(
        `Pecahan: ${buildCollectionNicknameTargetMonthExportText(benchmark) || "Tiada target"}`,
        180,
      ),
      margin,
      y,
    );
    y += 11;
  });

  return pageNumber;
}
