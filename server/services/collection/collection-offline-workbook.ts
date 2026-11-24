import { strToU8, zipSync, type Zippable } from "fflate";
import { parseCollectionAmountToCents } from "../../../shared/collection-amount-types";
import { HttpError } from "../../http/errors";
import type { CollectionRecord } from "../../storage-postgres-collection-types";

// The installed SheetJS reader does not write cell fills or frozen panes.
// Write this bounded report as native SpreadsheetML with no macro or formula parts.
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE = "http://schemas.openxmlformats.org/package/2006/relationships";
const SHEET = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.";
const STYLE = { text: 0, number: 1, amount: 2, date: 3, timestamp: 4, link: 5, abort: 6, cp: 7 } as const;
type Style = keyof typeof STYLE;
type Value = { value: string | number | null; style: Style; target?: string };
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

function receiptLink(target: string, label: string): Value {
  if (!/^Receipts\/[a-zA-Z0-9_-]+\.(?:pdf|jpe?g|png|webp)$/iu.test(target)) {
    throw new Error("Pautan resit setempat tidak sah.");
  }
  return { value: label, style: "link", target };
}

function status(value: CollectionRecord["cpStatus"]): Value {
  if (value === "abort_cp") return { value: "ABORT CP", style: "abort" };
  if (value === "cp") return { value: "CP", style: "cp" };
  return { value: "Unverified", style: "text" };
}

const recordColumns: Column[] = [
  ["Nama Pelanggan", 32], ["No. Kad", 24], ["No. Akaun", 24], ["Jumlah Bayaran", 19],
  ["Tarikh Bayaran", 18], ["Resit", 27], ["Status CP", 18], ["Record ID", 40],
  ["No. IC", 21], ["No. Telefon", 20], ["Nickname", 23], ["Batch", 14],
  ["Fail Sumber", 34], ["Nama Fail Asal", 34], ["Aging", 13], ["Billing Principal (OSP)", 25],
  ["Jumlah Perlu Dibayar", 24], ["Kutipan Terkumpul", 23], ["Baki Bayaran", 19],
  ["Ketepatan Padanan (%)", 25], ["Asas Padanan", 22], ["Tarikh Panggilan", 20],
  ["Akhir Tempoh Panggilan", 24], ["Bilangan Resit", 19], ["Jumlah Resit", 19],
  ["Status Semakan Resit", 24], ["Catatan Semakan Resit", 40], ["Resit Bertindih", 19],
  ["Status CP Automatik", 22], ["Sumber Penyelesaian", 25], ["Tarikh Penyelesaian", 23],
  ["Bayaran POOL", 19], ["Jumlah Ketika Pengesahan", 29], ["Status POOL", 21],
  ["Kesahan POOL", 28], ["Tarikh POOL", 18], ["Sebab POOL", 30], ["Rujukan POOL", 25],
  ["Catatan POOL", 40], ["Disahkan Oleh", 22], ["Disahkan Pada (UTC)", 24],
  ["Sebab Pembatalan POOL", 32], ["Dibatalkan Oleh", 22], ["Dibatalkan Pada (UTC)", 25],
  ["Direkod Oleh", 22], ["Dicipta (UTC)", 24], ["Dikemas Kini (UTC)", 24],
];

function recordRow(record: CollectionRecord, paths: readonly string[]): DataCell[] {
  const manual = record.manualSettlement;
  const link = paths[0] ? receiptLink(paths[0], paths.length > 1 ? `Lihat Resit (1/${paths.length})` : "Lihat Resit") : "Tiada Resit";
  return [
    record.customerName, record.cardNumber, record.accountNumber, money(record.amount),
    date(record.paymentDate), link, status(record.cpStatus), record.id, record.icNumber,
    record.customerPhone, record.collectionStaffNickname, record.batch,
    record.sourceImportName || record.sourceFilename, record.sourceFilename, record.agingBucket,
    money(record.billingPrincipalOsp), money(record.totalDue), money(record.cumulativeCollected),
    money(record.remainingAmount), record.sourceMatchAccuracy, record.sourceMatchBasis,
    date(record.callingDate), date(record.callingWindowEnd), paths.length, money(record.receiptTotalAmount),
    record.receiptValidationStatus, record.receiptValidationMessage, record.duplicateReceiptFlag ? "Ya" : "Tidak",
    record.automaticCpStatus ? status(record.automaticCpStatus) : null, record.effectiveSettlementSource,
    date(record.effectiveSettlementDate), money(manual?.poolAmount), money(manual?.effectiveTotal),
    manual?.status, manual?.validity, date(manual?.settlementDate), manual?.reason, manual?.reference,
    manual?.note, manual?.verifiedBy, date(manual?.verifiedAt, true), manual?.revokedReason,
    manual?.revokedBy, date(manual?.revokedAt, true), record.createdByLogin, date(record.createdAt, true),
    date(record.updatedAt, true),
  ];
}

const receiptColumns: Column[] = [
  ["Record ID", 40], ["Nama Pelanggan", 32], ["No. Akaun", 24], ["No. Kad", 24],
  ["No. Resit", 14], ["Jenis Fail", 15], ["Resit", 19],
];

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
      xf(0, fill, 165, "right"), xf(0, fill, 166, "right"), xf(3, fill), xf(4, 4), xf(4, 5));
  }
  return `${XML}<styleSheet xmlns="${SHEET}"><numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;RM&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy hh:mm:ss"/></numFmts><fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${formats.length}">${formats.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function relationship(id: string, type: string, target: string, external = false): string {
  return `<Relationship Id="${id}" Type="${OFFICE}/${type}" Target="${xml(target)}"${external ? ' TargetMode="External"' : ""}/>`;
}

function relationships(items: string[]): Uint8Array {
  return strToU8(`${XML}<Relationships xmlns="${PACKAGE}">${items.join("")}</Relationships>`);
}

function writeSheet(files: Zippable, index: number, columns: Column[], rows: Iterable<DataCell[]>, filter: boolean) {
  const letters = columns.map((_, i) => columnName(i));
  const cells: string[] = [];
  const links: string[] = [];
  const rels: string[] = [];
  let count = 0;
  let sheetBytes = 0;
  function row(values: DataCell[], header: boolean) {
    count++;
    if (values.length !== columns.length) throw new Error("Struktur kolum eksport tidak sepadan.");
    cells.push(`<row r="${count}"${header ? ' ht="28" customHeight="1"' : ""}>`);
    values.forEach((item, i) => {
      const cell: Value = item && typeof item === "object" ? item
        : { value: item ?? null, style: typeof item === "number" ? "number" : "text" };
      const ref = `${letters[i]}${count}`;
      const style = header ? 1 : 2 + (count % 2) * 8 + STYLE[cell.style];
      const attr = `r="${ref}" s="${style}"`;
      if (cell.target) {
        const id = `rId${links.length + 1}`;
        links.push(`<hyperlink ref="${ref}" r:id="${id}"/>`);
        rels.push(relationship(id, "hyperlink", cell.target, true));
      }
      let encoded: string;
      if (cell.value == null) encoded = `<c ${attr}/>`;
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
  const frozen = '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';
  const worksheet = `${XML}<worksheet xmlns="${SHEET}" xmlns:r="${OFFICE}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0">${frozen}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="17"/><cols>${widths}</cols><sheetData>${cells.join("")}</sheetData>${filter ? `<autoFilter ref="${range}"/>` : ""}${links.length ? `<hyperlinks>${links.join("")}</hyperlinks>` : ""}</worksheet>`;
  files[`xl/worksheets/sheet${index}.xml`] = strToU8(worksheet);
  if (rels.length) files[`xl/worksheets/_rels/sheet${index}.xml.rels`] = relationships(rels);
}

export function buildCollectionOfflineWorkbook(
  records: readonly CollectionRecord[],
  receipts: ReadonlyMap<string, readonly string[]>,
  generatedAt: Date,
): Uint8Array {
  const files: Zippable = {};
  let count = 0;
  let totalCents = 0;
  const rows = records.map(record => {
    const paths = receipts.get(record.id) ?? [];
    count += paths.length;
    const cents = parseCollectionAmountToCents(record.amount, { allowZero: true });
    if (cents === null || !Number.isSafeInteger(totalCents + cents)) throw new Error("Jumlah eksport tidak sah.");
    totalCents += cents;
    return recordRow(record, paths);
  });
  writeSheet(files, 1, recordColumns, rows, true);
  function* receiptRows() {
    for (const record of records) {
      for (const [i, target] of (receipts.get(record.id) ?? []).entries()) {
        yield [record.id, record.customerName, record.accountNumber, record.cardNumber,
          i + 1, target.slice(target.lastIndexOf(".") + 1).toUpperCase(), receiptLink(target, "Lihat Resit")];
      }
    }
  }
  writeSheet(files, 2, receiptColumns, receiptRows(), true);
  writeSheet(files, 3, [["Maklumat Eksport", 28], ["Nilai", 78]], [
    ["Dijana (UTC)", date(generatedAt, true)], ["Bilangan Rekod", records.length],
    ["Bilangan Resit", count], ["Jumlah Bayaran", { value: totalCents / 100, style: "amount" }],
    ["Cara guna", "Ekstrak ZIP dahulu. Buka Collection_Selected.xlsx dan klik pautan Lihat Resit."],
    ["Beberapa resit", "Buka Receipt Index dan tapis mengikut Record ID untuk melihat setiap resit."],
  ], false);

  const sheets = ["Collection Records", "Receipt Index", "Export Info"];
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
