import { formatAmountRM } from "@/pages/collection/utils";
import { fitCollectionRecordText } from "@/pages/collection-records/utils";
import type { CollectionRecord } from "@/lib/api";
import { formatDateTimeDDMMYYYY, formatIsoDateToDDMMYYYY } from "@/lib/date-format";
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

function hasReceiptAttachment(record: CollectionRecord): boolean {
  return (record.receipts?.length || 0) > 0;
}

export async function exportCollectionRecordsToExcel({
  visibleRecords,
  fromDate,
  toDate,
  summary,
}: CollectionRecordsExportParams) {
  const XLSX = await import("xlsx");
  const reportRows = visibleRecords.map((record) => [
    record.customerName,
    record.icNumber,
    record.accountNumber,
    record.customerPhone,
    parseCollectionAmountMyrNumber(record.amount),
    record.paymentDate,
    hasReceiptAttachment(record) ? "Available" : "-",
    record.collectionStaffNickname,
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
      "Customer Phone Number",
      "Amount",
      "Payment Date",
      "Receipt",
      "Staff Nickname",
    ],
    ...reportRows,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const maxColumnLength = (columnIndex: number) =>
    Math.max(...sheetData.map((row) => String(row[columnIndex] ?? "").length), 12);

  worksheet["!cols"] = Array.from({ length: 8 }).map((_, index) => ({
    wch: Math.min(38, maxColumnLength(index) + 2),
  }));

  const totalAmountCell = "B5";
  if (worksheet[totalAmountCell]) {
    worksheet[totalAmountCell].z = "\"RM\" #,##0.00";
  }

  for (let row = 8; row < 8 + reportRows.length; row += 1) {
    const amountCell = `E${row}`;
    if (worksheet[amountCell]) {
      worksheet[amountCell].z = "\"RM\" #,##0.00";
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
  const rowHeight = 7;
  const headers = ["Customer", "IC", "Account", "Phone", "Amount", "Pay Date", "Receipt", "Staff"];
  const colWidths = [46, 28, 36, 30, 22, 23, 17, 42];
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
    pdf.rect(margin, y, colWidths.reduce((a, b) => a + b, 0), rowHeight, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    let x = margin;
    headers.forEach((header, index) => {
      pdf.text(header, x + 1.5, y + 4.5);
      x += colWidths[index];
    });
    y += rowHeight;
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
    if (y + rowHeight > pageHeight - 14) {
      drawFooter();
      pdf.addPage();
      pageNo += 1;
      y = 12;
      drawHeader();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
    }

    const row = [
      fitCollectionRecordText(record.customerName, 22),
      fitCollectionRecordText(record.icNumber, 16),
      fitCollectionRecordText(record.accountNumber, 18),
      fitCollectionRecordText(record.customerPhone, 15),
      fitCollectionRecordText(formatAmountRM(record.amount), 12),
      fitCollectionRecordText(formatIsoDateToDDMMYYYY(record.paymentDate), 10),
      hasReceiptAttachment(record) ? "Yes" : "-",
      fitCollectionRecordText(record.collectionStaffNickname, 18),
    ];

    let x = margin;
    row.forEach((text, index) => {
      pdf.rect(x, y, colWidths[index], rowHeight);
      pdf.text(text, x + 1.5, y + 4.5);
      x += colWidths[index];
    });
    y += rowHeight;
  }

  drawFooter();
  pdf.save(`Collection-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
