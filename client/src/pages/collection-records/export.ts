import { formatAmountRM } from "@/pages/collection/utils";
import { getCollectionRecordSourceLabel } from "@/pages/collection-records/collection-source-label";
import type { CollectionRecord } from "@/lib/api";
import {
  getCollectionCpStatusLabel,
  getCollectionMatchAccuracyLabel,
} from "@/pages/collection-records/collection-coverage";
import { getCollectionCardNumberLabel } from "@/pages/collection-records/utils";
import { formatDateTimeDDMMYYYY, formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { loadClientSpreadsheetRuntime } from "@/lib/spreadsheet/xlsx-runtime";
import {
  parseCollectionAmountMyrNumber,
  type CollectionAmountMyrNumber,
} from "@shared/collection-amount-types";

interface CollectionRecordsExportParams {
  visibleRecords: CollectionRecord[];
  fromDate: string;
  toDate: string;
  summary: { totalRecords: number; totalAmount: CollectionAmountMyrNumber };
  canUseNicknameFilter: boolean;
  nicknameFilter: string;
}

type WorksheetCell = {
  z?: string;
};

function getWorksheetCell(worksheet: Record<string, unknown>, address: string): WorksheetCell | undefined {
  const value = worksheet[address];
  return typeof value === "object" && value !== null ? (value as WorksheetCell) : undefined;
}

function hasReceiptAttachment(record: CollectionRecord): boolean {
  return (record.receipts?.length || 0) > 0;
}

const SPREADSHEET_FORMULA_PREFIX = /^(?:[\t\r\n]|\s*[=+\-@])/u;

function safeSpreadsheetText(value: unknown): string {
  const text = String(value ?? "");
  return SPREADSHEET_FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

function optionalCollectionAmount(value: string | null | undefined): number | string {
  return value === null || value === undefined || value === ""
    ? ""
    : parseCollectionAmountMyrNumber(value);
}

export async function exportCollectionRecordsToExcel({
  visibleRecords,
  fromDate,
  toDate,
  summary,
}: CollectionRecordsExportParams) {
  const { module: XLSX } = await loadClientSpreadsheetRuntime();
  const reportRows = visibleRecords.map((record) => [
    safeSpreadsheetText(record.customerName),
    safeSpreadsheetText(record.icNumber),
    safeSpreadsheetText(record.accountNumber),
    safeSpreadsheetText(getCollectionCardNumberLabel(record.cardNumber)),
    safeSpreadsheetText(record.customerPhone),
    optionalCollectionAmount(record.billingPrincipalOsp),
    optionalCollectionAmount(record.totalDue),
    parseCollectionAmountMyrNumber(record.amount),
    optionalCollectionAmount(record.manualSettlement?.poolAmount),
    optionalCollectionAmount(record.manualSettlement?.effectiveTotal),
    getCollectionCpStatusLabel(record),
    record.agingBucket || "",
    record.paymentDate,
    hasReceiptAttachment(record) ? "Available" : "-",
    safeSpreadsheetText(getCollectionRecordSourceLabel(record)),
    getCollectionMatchAccuracyLabel(record.sourceMatchAccuracy),
    safeSpreadsheetText(record.collectionStaffNickname),
  ]);

  const sheetData: (string | number)[][] = [
    ["Collection Report"],
    ["Generated Date", formatDateTimeDDMMYYYY(new Date(), { includeSeconds: true })],
    ["Date Range", `${fromDate ? formatIsoDateToDDMMYYYY(fromDate) : "All"} - ${toDate ? formatIsoDateToDDMMYYYY(toDate) : "All"}`],
    ["Total Records", summary.totalRecords],
    ["Total Amount", summary.totalAmount],
    [],
    [
      "Customer Name",
      "IC Number",
      "Account Number",
      "Card Number",
      "Customer Phone Number",
      "Billing Principal (OSP)",
      "TOTAL DUE",
      "User Collection Amount",
      "POOL (External Payment Evidence)",
      "Settlement Total at Verification",
      "CP Status",
      "Aging",
      "Payment Date",
      "Receipt",
      "Source File",
      "Match Accuracy",
      "Staff Nickname",
    ],
    ...reportRows,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const maxColumnLength = (columnIndex: number) =>
    Math.max(...sheetData.map((row) => String(row[columnIndex] ?? "").length), 12);

  worksheet["!cols"] = Array.from({ length: 17 }).map((_, index) => ({
    wch: Math.min(38, maxColumnLength(index) + 2),
  }));

  const totalAmountCell = "B5";
  const totalAmountWorksheetCell = getWorksheetCell(worksheet, totalAmountCell);
  if (totalAmountWorksheetCell) {
    totalAmountWorksheetCell.z = "\"RM\" #,##0.00";
  }

  for (let row = 8; row < 8 + reportRows.length; row += 1) {
    for (const column of ["F", "G", "H", "I", "J"]) {
      const worksheetCell = getWorksheetCell(worksheet, `${column}${row}`);
      if (worksheetCell) {
        worksheetCell.z = "\"RM\" #,##0.00";
      }
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Collection Report");
  XLSX.writeFile(workbook, `Collection-Report-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportCollectionRecordsToPdf({
  visibleRecords,
  fromDate,
  toDate,
  summary,
  canUseNicknameFilter,
  nicknameFilter,
}: CollectionRecordsExportParams) {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const margin = 10;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const headerRowHeight = 7;
  const headers: Array<string | string[]> = [
    "Customer",
    "IC",
    "Account",
    "Card",
    "Phone",
    ["Billing Principal", "(OSP)"],
    "TOTAL DUE",
    ["User Collection", "Amount"],
    "POOL",
    ["Settlement Total", "at Verification"],
    "CP",
    "Aging",
    "Pay Date",
    "Receipt",
    "Source",
    "Match",
    "Staff",
  ];
  const colWidths = [22, 17, 18, 17, 16, 17, 16, 16, 16, 16, 13, 9, 14, 9, 18, 11, 18];
  let y = 12;
  let pageNo = 1;

  const drawHeader = () => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("Collection Report", margin, y);
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Generated Date: ${formatDateTimeDDMMYYYY(new Date(), { includeSeconds: true })}`, margin, y);
    y += 5;
    const staffLabel = canUseNicknameFilter && nicknameFilter !== "all" ? nicknameFilter : "All";
    pdf.text(`Staff: ${staffLabel}`, margin, y);
    y += 5;
    pdf.text(`Date Range: ${fromDate ? formatIsoDateToDDMMYYYY(fromDate) : "All"} - ${toDate ? formatIsoDateToDDMMYYYY(toDate) : "All"}`, margin, y);
    y += 6;

    pdf.setFillColor(235, 240, 248);
    pdf.rect(margin, y, colWidths.reduce((a, b) => a + b, 0), headerRowHeight, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    let x = margin;
    headers.forEach((header, index) => {
      pdf.text(header, x + 1, Array.isArray(header) ? y + 3 : y + 4.5);
      x += colWidths[index];
    });
    y += headerRowHeight;
  };

  const drawFooter = () => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(`Total Records: ${summary.totalRecords}`, margin, pageHeight - 8);
    pdf.text(`Total Amount: ${formatAmountRM(summary.totalAmount)}`, margin + 70, pageHeight - 8);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Page ${pageNo}`, pageWidth - margin - 14, pageHeight - 8);
  };

  drawHeader();
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);

  for (const record of visibleRecords) {
    const row = [
      record.customerName || "-",
      record.icNumber || "-",
      record.accountNumber || "-",
      getCollectionCardNumberLabel(record.cardNumber),
      record.customerPhone || "-",
      record.billingPrincipalOsp ? formatAmountRM(record.billingPrincipalOsp) : "-",
      record.totalDue ? formatAmountRM(record.totalDue) : "-",
      formatAmountRM(record.amount),
      record.manualSettlement?.poolAmount
        ? formatAmountRM(record.manualSettlement.poolAmount)
        : "-",
      record.manualSettlement?.effectiveTotal
        ? formatAmountRM(record.manualSettlement.effectiveTotal)
        : "-",
      getCollectionCpStatusLabel(record),
      record.agingBucket || "-",
      formatIsoDateToDDMMYYYY(record.paymentDate),
      hasReceiptAttachment(record) ? "Yes" : "-",
      getCollectionRecordSourceLabel(record),
      getCollectionMatchAccuracyLabel(record.sourceMatchAccuracy),
      record.collectionStaffNickname || "-",
    ];
    const wrappedRow = row.map((text, index) => {
      const wrapped = pdf.splitTextToSize(String(text), Math.max(1, colWidths[index] - 3));
      return Array.isArray(wrapped) && wrapped.length > 0 ? wrapped.map(String) : [String(text)];
    });
    const lineHeight = 3.2;
    const recordRowHeight = Math.max(
      7,
      Math.max(...wrappedRow.map((lines) => lines.length)) * lineHeight + 2.2,
    );

    if (y + recordRowHeight > pageHeight - 14) {
      drawFooter();
      pdf.addPage();
      pageNo += 1;
      y = 12;
      drawHeader();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
    }

    let x = margin;
    wrappedRow.forEach((lines, index) => {
      pdf.rect(x, y, colWidths[index], recordRowHeight);
      lines.forEach((line, lineIndex) => {
        pdf.text(line, x + 1.5, y + 3.8 + lineIndex * lineHeight);
      });
      x += colWidths[index];
    });
    y += recordRowHeight;
  }

  drawFooter();
  pdf.save(`Collection-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
