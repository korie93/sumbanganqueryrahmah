import { strToU8, zipSync, type Zippable } from "fflate";
import { formatCollectionCurrencyLabelFromCents, parseCollectionAmountToCents } from "../../../shared/collection-amount-types";
import { allCollectionExcelColumnIds, collectionExcelColumns, type CollectionExcelColumnId } from "../../../shared/common/collection-excel-columns";
import { HttpError } from "../../http/errors";
import type { CollectionRecord } from "../../storage-postgres-collection-types";

// The installed SheetJS reader does not write cell fills or frozen panes.
// Write this bounded report as native SpreadsheetML with literal user data and one generated subtotal formula.
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE = "http://schemas.openxmlformats.org/package/2006/relationships";
const SHEET = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.";
const STYLE = { text: 0, number: 1, amount: 2, date: 3, timestamp: 4, link: 5, abort: 6, cp: 7, amountLink: 8 } as const;
const stylesPerBand = Object.keys(STYLE).length;
const receiptPreviewLimit = 5;
const missingReceiptAmount = "Amaun tidak direkodkan";
export type WorkbookReceipt = { target: string; amountCents: number | null };
type Style = keyof typeof STYLE;
type Value = { value: string | number | null; style: Style; target?: string; receiptIndexRow?: number;
  filteredAmount?: { column: number; records: number } };
type DataCell = Value | string | number | null | undefined;
type Column = readonly [label: string, width: number];

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function inlineText(value: string): string {
  if (value.length > 32_767) throw new Error("Teks eksport melebihi had sel Excel.");
  // Escape reserved Excel literals and replace code points invalid in XML 1.0.
  const printable = value.replace(/_x([\da-f]{4})_/gi, "_x005F_x$1_")
    .replace(/[^\t\n\r\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, " ");
  return xml(printable);
}

function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + (n - 1) % 26) + name;
  }
  return name;
}

function money(value: string | null | undefined): Value {
  if (value == null || value === "") return { value: null, style: "amount" };
  const raw = value.trim();
  const negative = raw.startsWith("-");
  const cents = parseCollectionAmountToCents(negative ? raw.slice(1) : raw, { allowZero: true });
  if (cents === null) throw new Error("Jumlah bayaran eksport tidak sah.");
  return { value: (negative ? -cents : cents) / 100, style: "amount" };
}

function date(value: string | Date | null | undefined, time = false): Value {
  const style = time ? "timestamp" : "date";
  if (value == null || value === "") return { value: null, style };
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error("Tarikh rekod eksport tidak sah.");
  const days = ms / 86_400_000 + 25_569; // Excel's Windows 1900 date system.
  return { value: time ? days : Math.floor(days), style };
}

function receiptLink({ target, amountCents }: WorkbookReceipt): Value {
  if (!/^Receipts\/[a-zA-Z0-9_-]+\.(?:pdf|jpe?g|png|webp)$/iu.test(target)) {
    throw new Error("Pautan resit setempat tidak sah.");
  }
  return amountCents === null ? { value: missingReceiptAmount, style: "link", target }
    : { value: amountCents / 100, style: "amountLink", target };
}

function status(value: CollectionRecord["cpStatus"]): Value {
  if (value === "abort_cp") return { value: "ABORT CP", style: "abort" };
  if (value === "cp") return { value: "CP", style: "cp" };
  return { value: "Unverified", style: "text" };
}

type RecordValue = (record: CollectionRecord, receipts: readonly WorkbookReceipt[], indexRow: number) => DataCell;
const recordValues: Record<CollectionExcelColumnId, RecordValue> = {
  customerName: record => record.customerName,
  cardNumber: record => record.cardNumber,
  accountNumber: record => record.accountNumber,
  amount: record => money(record.amount),
  paymentDate: record => date(record.paymentDate),
  receipt: (_, receipts, indexRow) => {
    if (!receipts.length) return "Tiada Resit";
    if (receipts.length === 1) return receiptLink(receipts[0]);
    const lines = receipts.slice(0, receiptPreviewLimit).map(({ amountCents }, i) => {
      const amount = amountCents === null ? missingReceiptAmount : formatCollectionCurrencyLabelFromCents(amountCents);
      return `Resit ${i + 1} · ${amount}`;
    });
    if (receipts.length > receiptPreviewLimit) lines.push(`Lihat semua ${receipts.length} resit`);
    return { value: lines.join("\n"), style: "link", receiptIndexRow: indexRow };
  },
  cpStatus: record => status(record.cpStatus),
  recordId: record => record.id,
  icNumber: record => record.icNumber,
  customerPhone: record => record.customerPhone,
  nickname: record => record.collectionStaffNickname,
  batch: record => record.batch,
  sourceName: record => record.sourceImportName || record.sourceFilename,
  sourceFilename: record => record.sourceFilename,
  aging: record => record.agingBucket,
  billingPrincipalOsp: record => money(record.billingPrincipalOsp),
  totalDue: record => money(record.totalDue),
  cumulativeCollected: record => money(record.cumulativeCollected),
  remainingAmount: record => money(record.remainingAmount),
  sourceMatchAccuracy: record => record.sourceMatchAccuracy,
  sourceMatchBasis: record => record.sourceMatchBasis,
  callingDate: record => date(record.callingDate),
  callingWindowEnd: record => date(record.callingWindowEnd),
  receiptCount: (_, receipts) => receipts.length,
  receiptTotalAmount: record => money(record.receiptTotalAmount),
  receiptValidationStatus: record => record.receiptValidationStatus,
  receiptValidationMessage: record => record.receiptValidationMessage,
  duplicateReceiptFlag: record => record.duplicateReceiptFlag ? "Ya" : "Tidak",
  automaticCpStatus: record => record.automaticCpStatus ? status(record.automaticCpStatus) : null,
  effectiveSettlementSource: record => record.effectiveSettlementSource,
  effectiveSettlementDate: record => date(record.effectiveSettlementDate),
  poolAmount: record => money(record.manualSettlement?.poolAmount),
  effectiveTotal: record => money(record.manualSettlement?.effectiveTotal),
  poolStatus: record => record.manualSettlement?.status,
  validity: record => record.manualSettlement?.validity,
  settlementDate: record => date(record.manualSettlement?.settlementDate),
  reason: record => record.manualSettlement?.reason,
  reference: record => record.manualSettlement?.reference,
  note: record => record.manualSettlement?.note,
  verifiedBy: record => record.manualSettlement?.verifiedBy,
  verifiedAt: record => date(record.manualSettlement?.verifiedAt, true),
  revokedReason: record => record.manualSettlement?.revokedReason,
  revokedBy: record => record.manualSettlement?.revokedBy,
  revokedAt: record => date(record.manualSettlement?.revokedAt, true),
  createdByLogin: record => record.createdByLogin,
  createdAt: record => date(record.createdAt, true),
  updatedAt: record => date(record.updatedAt, true),
};

function styles(): string {
  const fonts = [
    "", '<b/><color rgb="FFFFFFFF"/>', '<color rgb="FF166534"/>',
    '<u/><color rgb="FF173B70"/>', '<color rgb="FFFFFFFF"/>',
  ].map(properties => `<font>${properties}<sz val="11"/><name val="Calibri"/></font>`);
  const fills = ["none", "gray125", "334155", "F8FAFC", "173B70", "B42332"].map((color, index) =>
    index < 2 ? `<fill><patternFill patternType="${color}"/></fill>`
      : `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`);
  function xf(font: number, fill: number, format = 0, alignment = "left") {
    return `<xf numFmtId="${format}" fontId="${font}" fillId="${fill}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${alignment}" vertical="center" wrapText="1"/></xf>`;
  }
  const formats = [xf(0, 0), xf(1, 2)];
  for (const fill of [0, 3]) {
    formats.push(xf(0, fill), xf(0, fill, 0, "right"), xf(2, fill, 164, "right"),
      xf(0, fill, 165, "right"), xf(0, fill, 166, "right"), xf(3, fill), xf(4, 4), xf(4, 5), xf(3, fill, 164, "right"));
  }
  return `${XML}<styleSheet xmlns="${SHEET}"><numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;RM&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy hh:mm:ss"/></numFmts><fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${formats.length}">${formats.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function relationship(id: string, type: string, target: string, external = false): string {
  return `<Relationship Id="${id}" Type="${OFFICE}/${type}" Target="${xml(target)}"${external ? ' TargetMode="External"' : ""}/>`;
}

function relationships(items: string[]): Uint8Array {
  return strToU8(`${XML}<Relationships xmlns="${PACKAGE}">${items.join("")}</Relationships>`);
}

type SheetOptions = { filter?: boolean; freezeName?: boolean };

function writeSheet(files: Zippable, index: number, columns: Column[], rows: Iterable<DataCell[]>, options: SheetOptions = {}) {
  const letters = columns.map((_, i) => columnName(i));
  const cells: string[] = [];
  const links: string[] = [];
  const rels: string[] = [];
  let count = 0;
  let sheetBytes = 0;
  function row(values: DataCell[], header: boolean) {
    count++;
    if (values.length !== columns.length) throw new Error("Struktur kolum eksport tidak sepadan.");
    const receiptSummary = values.find((item): item is Value =>
      typeof item === "object" && item !== null && item.receiptIndexRow !== undefined);
    const height = header ? 28 : receiptSummary ? String(receiptSummary.value).split("\n").length * 17 : null;
    cells.push(`<row r="${count}"${height ? ` ht="${height}" customHeight="1"` : ""}>`);
    values.forEach((item, i) => {
      const cell: Value = item && typeof item === "object" ? item
        : { value: item ?? null, style: typeof item === "number" ? "number" : "text" };
      const ref = `${letters[i]}${count}`;
      const style = header ? 1 : 2 + (count % 2) * stylesPerBand + STYLE[cell.style];
      const attr = `r="${ref}" s="${style}"`;
      if (cell.receiptIndexRow !== undefined) {
        links.push(`<hyperlink ref="${ref}" location="'Receipt Index'!A${cell.receiptIndexRow}"/>`);
      } else if (cell.target) {
        const id = `rId${links.length + 1}`;
        links.push(`<hyperlink ref="${ref}" r:id="${id}"/>`);
        rels.push(relationship(id, "hyperlink", cell.target, true));
      }
      let encoded: string;
      if (cell.filteredAmount && cell.filteredAmount.records > 0) {
        const letter = columnName(cell.filteredAmount.column);
        const range = `'Collection Records'!${letter}2:${letter}${cell.filteredAmount.records + 1}`;
        encoded = `<c ${attr}><f>SUBTOTAL(109,${range})</f><v>${cell.value}</v></c>`;
      } else if (cell.value == null) encoded = `<c ${attr}/>`;
      else if (typeof cell.value === "number") encoded = `<c ${attr}><v>${cell.value}</v></c>`;
      else encoded = `<c ${attr} t="inlineStr"><is><t xml:space="preserve">${inlineText(cell.value)}</t></is></c>`;
      sheetBytes += Buffer.byteLength(encoded);
      if (sheetBytes > 12 * 1024 * 1024) {
        throw new HttpError(413, "Kandungan Excel terlalu besar. Bahagikan pilihan kepada beberapa eksport.", { code: "PAYLOAD_TOO_LARGE" });
      }
      cells.push(encoded);
    });
    cells.push("</row>");
  }
  row(columns.map(([label]) => label), true);
  for (const data of rows) row(data, false);
  const range = `A1:${letters[letters.length - 1]}${count}`;
  const widths = columns.map(([, width], i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("");
  const pane = options.freezeName ? "bottomRight" : "bottomLeft";
  const firstCell = options.freezeName ? "B2" : "A2";
  const frozen = `<pane ${options.freezeName ? 'xSplit="1" ' : ""}ySplit="1" topLeftCell="${firstCell}" activePane="${pane}" state="frozen"/><selection pane="${pane}" activeCell="${firstCell}" sqref="${firstCell}"/>`;
  const worksheet = `${XML}<worksheet xmlns="${SHEET}" xmlns:r="${OFFICE}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0">${frozen}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="17"/><cols>${widths}</cols><sheetData>${cells.join("")}</sheetData>${options.filter ? `<autoFilter ref="${range}"/>` : ""}${links.length ? `<hyperlinks>${links.join("")}</hyperlinks>` : ""}</worksheet>`;
  files[`xl/worksheets/sheet${index}.xml`] = strToU8(worksheet);
  if (rels.length) files[`xl/worksheets/_rels/sheet${index}.xml.rels`] = relationships(rels);
}

export function buildCollectionOfflineWorkbook(
  records: readonly CollectionRecord[],
  receipts: ReadonlyMap<string, readonly WorkbookReceipt[]>,
  generatedAt: Date,
  columnIds: readonly CollectionExcelColumnId[] = allCollectionExcelColumnIds,
): Uint8Array {
  const files: Zippable = {};
  const selected = new Set(columnIds);
  const columns = collectionExcelColumns.filter(column => selected.has(column.id));
  if (!columns.length) throw new Error("Pilih sekurang-kurangnya satu lajur Excel.");
  const amountColumn = columns.findIndex(column => column.id === "amount");
  let count = 0;
  let totalCents = 0;
  const rows = records.map(record => {
    const attachments = receipts.get(record.id) ?? [];
    const indexRow = count + 2;
    count += attachments.length;
    const cents = parseCollectionAmountToCents(record.amount, { allowZero: true });
    if (cents === null || !Number.isSafeInteger(totalCents + cents)) throw new Error("Jumlah eksport tidak sah.");
    totalCents += cents;
    return columns.map(column => recordValues[column.id](record, attachments, indexRow));
  });
  writeSheet(files, 1, columns.map(({ label, width }) => [label, width]), rows, {
    filter: true, freezeName: selected.has("customerName"),
  });

  const sheets = ["Collection Records"];
  if (selected.has("receipt")) {
    sheets.push("Receipt Index");
    const identifiers = (["recordId", "customerName", "accountNumber", "cardNumber"] as const)
      .flatMap(id => columns.filter(column => column.id === id));
    function* receiptRows() {
      for (const record of records) {
        for (const [i, receipt] of (receipts.get(record.id) ?? []).entries()) {
          yield [...identifiers.map(column => recordValues[column.id](record, [], 0)),
            i + 1, receipt.target.slice(receipt.target.lastIndexOf(".") + 1).toUpperCase(), receiptLink(receipt)];
        }
      }
    }
    const indexColumns: Column[] = identifiers.map(({ label, width }) => [label, width]);
    indexColumns.push(["No. Resit", 14], ["Jenis Fail", 15], ["Resit", 28]);
    writeSheet(files, 2, indexColumns, receiptRows(), { filter: true });
  }

  const info: DataCell[][] = [
    ["Dijana (UTC)", date(generatedAt, true)], ["Bilangan Rekod", records.length], ["Bilangan Resit", count],
  ];
  if (amountColumn >= 0) {
    info.push(["Jumlah Bayaran", { value: totalCents / 100, style: "amount" }],
      ["Jumlah bayaran yang dipaparkan", { value: totalCents / 100, style: "amount",
        filteredAmount: { column: amountColumn, records: records.length } }]);
  }
  info.push(["Cara guna", "Ekstrak ZIP dahulu dan kekalkan fail Excel bersama folder Receipts."]);
  if (selected.has("receipt")) info.push(["Pautan resit", "Klik amaun untuk membuka fail resit. Untuk transaksi dengan beberapa resit, klik pecahan amaun untuk membuka Receipt Index, kemudian pilih resit."]);
  sheets.push("Export Info");
  writeSheet(files, sheets.length, [["Maklumat Eksport", 28], ["Nilai", 78]], info);

  const workbook = sheets.map((name, i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  files["xl/workbook.xml"] = strToU8(`${XML}<workbook xmlns="${SHEET}" xmlns:r="${OFFICE}"><bookViews><workbookView/></bookViews><sheets>${workbook}</sheets></workbook>`);
  files["xl/styles.xml"] = strToU8(styles());
  files["_rels/.rels"] = relationships([relationship("rId1", "officeDocument", "xl/workbook.xml")]);
  files["xl/_rels/workbook.xml.rels"] = relationships([
    ...sheets.map((_, i) => relationship(`rId${i + 1}`, "worksheet", `worksheets/sheet${i + 1}.xml`)),
    relationship("rIdStyles", "styles", "styles.xml"),
  ]);
  const sheetTypes = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CONTENT}worksheet+xml"/>`).join("");
  files["[Content_Types].xml"] = strToU8(`${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CONTENT}sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${CONTENT}styles+xml"/>${sheetTypes}</Types>`);
  return zipSync(files, { level: 1 });
}
