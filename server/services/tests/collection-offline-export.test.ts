import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { strFromU8, unzipSync } from "fflate";
import * as XLSX from "xlsx";
import { HttpError } from "../../http/errors";
import type { CollectionRecord, CollectionRecordReceipt } from "../../storage-postgres-collection-types";
import { buildCollectionOfflineWorkbook } from "../collection/collection-offline-workbook";

const today = new Date("2026-02-28T12:30:45Z");
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "ascii");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+X1eO0QAAAABJRU5ErkJggg==", "base64");
const jpg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUAQEAAAAAAAAAAAAAAAAAAAAF/9oADAMBAAIQAxAAAAGYFDf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEPP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==", "base64");
const webp = Buffer.from("UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAEAdQtJKUtYCBiOh/AAA=", "base64");
const formats = { pdf: [pdf, "application/pdf"], png: [png, "image/png"], jpg: [jpg, "image/jpeg"], webp: [webp, "image/webp"] } as const;
const originalCwd = process.cwd();
let workspace: string;
let managed: string;
let createArchive: typeof import("../collection/collection-offline-archive").createCollectionOfflineArchive;

before(async () => {
  // The production path resolver pins its managed root at module initialization.
  // Use the private cwd of this isolated Node test process, never project uploads.
  workspace = await mkdtemp(path.join(os.tmpdir(), "sqr-offline-fixture-"));
  managed = path.join(workspace, "uploads", "collection-receipts");
  await mkdir(managed, { recursive: true });
  process.chdir(workspace);
  ({ createCollectionOfflineArchive: createArchive } = await import("../collection/collection-offline-archive"));
});

after(async () => {
  process.chdir(originalCwd);
  if (workspace) await rm(workspace, { recursive: true, force: true });
});

function id(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function record(n: number): CollectionRecord {
  return {
    id: id(n), customerName: `Pelanggan rekaan ${n} 林 அ`, cardNumber: "00009900112233445566",
    accountNumber: "000000111222333444555", icNumber: "001122335500", customerPhone: "0120001234",
    paymentDate: "2026-02-28", amount: "1500.02", batch: "P10", createdAt: today,
    receiptFile: null, receiptCount: 0, receipts: [], receiptTotalAmount: "0.00", duplicateReceiptFlag: false,
    receiptValidationMessage: null, receiptValidationStatus: "unverified", cpStatus: "unverified",
    createdByLogin: "demo", collectionStaffNickname: "@demo", sourceFilename: "asli-demo.xlsx",
    sourceImportName: "Sumber contoh", remainingAmount: "0.00",
  };
}

async function attach(r: CollectionRecord, extension: keyof typeof formats) {
  const [bytes, mime] = formats[extension];
  const name = `${r.id}-${r.receipts.length + 1}.${extension}`;
  const receipt: CollectionRecordReceipt = {
    id: id(10000 + r.receipts.length), collectionRecordId: r.id, storagePath: "/uploads/collection-receipts/" + name,
    originalFileName: `Resit semakan [试].${extension}`, originalMimeType: mime, originalExtension: "." + extension,
    fileSize: bytes.length, createdAt: today, fileHash: createHash("sha256").update(bytes).digest("hex"),
    receiptAmount: null, extractedAmount: null, extractionStatus: "unprocessed", extractionConfidence: null,
    receiptDate: null, receiptReference: null, deletedAt: null,
  };
  await writeFile(path.join(managed, name), bytes);
  r.receipts.push(receipt);
  r.receiptCount++;
  r.receiptFile ??= receipt.storagePath;
  return receipt;
}

function openWorkbook(data: Uint8Array) {
  return XLSX.read(data, { type: "array", cellNF: true, cellStyles: true, cellDates: true });
}

function cellAt(sheet: XLSX.WorkSheet, address: string): XLSX.CellObject {
  const cell = sheet[address];
  assert.ok(cell && typeof cell === "object" && "t" in cell && "v" in cell, `Missing cell ${address}`);
  return cell as XLSX.CellObject;
}

function columnCell(sheet: XLSX.WorkSheet, label: string, row: number): XLSX.CellObject {
  const columns = XLSX.utils.decode_range(sheet["!ref"]!).e.c;
  for (let col = 0; col <= columns; col++) {
    if (cellAt(sheet, XLSX.utils.encode_cell({ r: 0, c: col })).v === label) {
      return cellAt(sheet, XLSX.utils.encode_cell({ r: row - 1, c: col }));
    }
  }
  assert.fail(`Missing header ${label}`);
}

function outputDir() {
  return mkdtemp(path.join(workspace, "output-"));
}

test("workbook keeps selected order, actual numeric/date data, governed identifiers, filters and status styles", () => {
  const a = { ...record(2), cpStatus: "abort_cp" as const };
  const b = { ...record(1), cpStatus: "cp" as const, cardNumber: null, cardNumberLast4: "1234" };
  const bytes = buildCollectionOfflineWorkbook([a, b], new Map(), today);
  const book = openWorkbook(bytes);
  assert.deepEqual(book.SheetNames, ["Collection Records", "Receipt Index", "Export Info"]);
  const sheet = book.Sheets["Collection Records"]!;
  assert.equal(columnCell(sheet, "Record ID", 2).v, a.id);
  assert.equal(columnCell(sheet, "Record ID", 3).v, b.id);
  for (const [label, expected] of [["No. Akaun", a.accountNumber], ["No. Kad", a.cardNumber],
    ["No. IC", a.icNumber], ["No. Telefon", a.customerPhone], ["Nama Pelanggan", a.customerName],
    ["Nickname", a.collectionStaffNickname], ["Fail Sumber", a.sourceImportName], ["Nama Fail Asal", a.sourceFilename]]) {
    assert.equal(columnCell(sheet, label!, 2).v, expected);
    assert.equal(columnCell(sheet, label!, 2).t, "s");
  }
  // SheetJS can return a styled blank cell without a value when only the last four digits are known.
  assert.equal(cellAt(sheet, "B1").v, "No. Kad");
  assert.equal((sheet.B3 as XLSX.CellObject | undefined)?.v, undefined);
  assert.equal(columnCell(sheet, "Jumlah Bayaran", 2).t, "n");
  assert.equal(columnCell(sheet, "Jumlah Bayaran", 2).v, 1500.02);
  assert.match(String(columnCell(sheet, "Jumlah Bayaran", 2).z), /RM.*#,##0\.00/);
  assert.equal(columnCell(sheet, "Baki Bayaran", 2).v, 0);
  assert.equal(columnCell(sheet, "Tarikh Bayaran", 2).t, "d");
  assert.equal(columnCell(sheet, "Tarikh Bayaran", 2).w, "28/02/2026");
  assert.equal(columnCell(sheet, "Status CP", 2).v, "ABORT CP");
  assert.equal(columnCell(sheet, "Status CP", 3).v, "CP");
  assert.equal(columnCell(sheet, "Status CP", 2).s?.fgColor?.rgb, "173B70");
  assert.equal(columnCell(sheet, "Status CP", 3).s?.fgColor?.rgb, "B42332");
  assert.equal(cellAt(sheet, "A1").s?.fgColor?.rgb, "334155");
  assert.equal(cellAt(sheet, "A3").s?.fgColor?.rgb, "F8FAFC");
  assert.equal(columnCell(sheet, "Resit", 2).v, "Tiada Resit");
  assert.equal(columnCell(sheet, "Resit", 2).l, undefined);
  assert.equal(cellAt(book.Sheets["Export Info"]!, "B5").v, 3000.04);
  const subtotal = cellAt(book.Sheets["Export Info"]!, "B6");
  assert.equal(subtotal.f, "SUBTOTAL(109,'Collection Records'!D2:D3)");
  assert.equal(subtotal.v, 3000.04);
  const files = unzipSync(bytes);
  assert.match(strFromU8(files["xl/worksheets/sheet1.xml"]), /xSplit="1" ySplit="1" topLeftCell="B2"/);
  for (const [number, name] of [[1, "Collection Records"], [2, "Receipt Index"]] as const) {
    const xml = strFromU8(files[`xl/worksheets/sheet${number}.xml`]);
    assert.ok(xml.includes(`<autoFilter ref="${book.Sheets[name]!["!ref"]}"/>`));
    assert.match(xml, /<pane[^>]+ySplit="1"[^>]+state="frozen"/);
    assert.doesNotMatch(xml, /<mergeCells\b/);
  }
  const amountStyle = Number(strFromU8(files["xl/worksheets/sheet1.xml"]).match(/<c r="D2" s="(\d+)"/)?.[1]);
  const styles = strFromU8(files["xl/styles.xml"]);
  const xfs = styles.split("<cellXfs")[1]!.split("</cellXfs>")[0]!.match(/<xf [^>]+>/g)!;
  const font = Number(xfs[amountStyle].match(/fontId="(\d+)"/)?.[1]);
  assert.match(styles.match(/<font>.*?<\/font>/g)![font], /FF166534/);
});

test("character prefixes, Unicode and XML characters round-trip as literal values", () => {
  const names = ["=1+1", "+1800", "-42", "@示例", "\t=2", "A & B <C>", "Nama\u0001X"];
  const records = names.map((customerName, i) => ({ ...record(i + 1), customerName }));
  const bytes = buildCollectionOfflineWorkbook(records, new Map(), today);
  const sheet = openWorkbook(bytes).Sheets["Collection Records"]!;
  names.forEach((name, i) => {
    const cell = columnCell(sheet, "Nama Pelanggan", i + 2);
    assert.equal(cell.t, "s");
    assert.equal(cell.v, name.replace("\u0001", " "));
    assert.equal(cell.f, undefined);
    assert.equal(cell.l, undefined);
  });
});

test("export extracts only the selected record with all original files and resolves every link after moving the folder", async () => {
  const selected = record(10);
  await attach(selected, "pdf");
  await attach(selected, "jpg");
  await attach(selected, "png");
  await attach(selected, "png"); // Same original name; each active attachment still has its own target.
  await attach(selected, "webp");
  await attach(record(11), "jpg");
  const dest = await outputDir();
  const result = await createArchive([selected], dest, new AbortController().signal);
  assert.equal(result.receiptCount, 5);
  const files = unzipSync(await readFile(result.path));
  const entries = Object.keys(files);
  assert.equal(entries.filter(name => !name.endsWith("/")).length, 7);
  const workbookPath = entries.find(name => name.endsWith("/Collection_Selected.xlsx"))!;
  const directory = path.posix.dirname(workbookPath);
  const extracted = path.join(dest, "extracted");
  for (const [name, bytes] of Object.entries(files)) {
    assert.ok(name.startsWith(directory + "/"));
    assert.doesNotMatch(name, /\.\.|[:\\]/);
    const target = path.join(extracted, name);
    if (!name.endsWith("/")) {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
  }
  const moved = path.join(dest, "folder-baharu");
  await rename(path.join(extracted, directory), moved);
  const book = openWorkbook(await readFile(path.join(moved, "Collection_Selected.xlsx")));
  const sheet = book.Sheets["Collection Records"]!;
  const index = book.Sheets["Receipt Index"]!;
  assert.equal(XLSX.utils.decode_range(sheet["!ref"]!).e.r, 1);
  assert.equal(columnCell(sheet, "Record ID", 2).v, selected.id);
  assert.equal(columnCell(sheet, "Bilangan Resit", 2).v, 5);
  assert.equal(XLSX.utils.decode_range(index["!ref"]!).e.r, 5);
  const targets = new Set<string>();
  for (const [i, expected] of [pdf, jpg, png, png, webp].entries()) {
    assert.equal(columnCell(index, "Record ID", i + 2).v, selected.id);
    const link = columnCell(index, "Resit", i + 2).l!.Target;
    assert.match(link, /^Receipts\/[\da-f-]+_\d+\.(pdf|jpg|png|webp)$/);
    assert.deepEqual(await readFile(path.join(moved, link)), expected);
    targets.add(link);
  }
  assert.equal(targets.size, 5);
  assert.equal(columnCell(sheet, "Resit", 2).l!.Target, "#'Receipt Index'!A2");
  assert.match(await readFile(path.join(moved, "Export_Readme.txt"), "utf8"), /ekstrak/i);
});

test("column choices project values throughout Excel, preserve original attachments and use the projected amount address", async () => {
  const a = record(80);
  const b = { ...record(81), customerName: a.customerName };
  b.amount = "3250.00";
  (await attach(a, "jpg")).receiptAmount = "0.00";
  (await attach(b, "jpg")).receiptAmount = "250.00";
  (await attach(b, "pdf")).receiptAmount = "3000.00";
  const dest = await outputDir();
  const result = await createArchive([a, b], dest, new AbortController().signal, ["receipt", "amount"]);
  const files = unzipSync(await readFile(result.path));
  const workbook = Object.keys(files).find(name => name.endsWith("/Collection_Selected.xlsx"))!;
  const book = openWorkbook(files[workbook]);
  const sheet = book.Sheets["Collection Records"]!;
  assert.equal(sheet["!ref"], "A1:B3");
  assert.equal(cellAt(sheet, "A1").v, "Jumlah Bayaran");
  assert.equal(cellAt(sheet, "B1").v, "Resit");
  assert.equal(cellAt(sheet, "B2").v, 0);
  assert.equal(cellAt(sheet, "B2").w, "RM 0.00");
  assert.match(cellAt(sheet, "B2").l!.Target, /^Receipts\/.+_01.jpg$/);
  assert.equal(String(cellAt(sheet, "B3").v).replace(/\u00a0/g, " "), "Resit 1 · RM 250.00\nResit 2 · RM 3,000.00");
  assert.equal(cellAt(sheet, "A3").v, 3250);
  assert.equal(cellAt(sheet, "B3").l!.Target, "#'Receipt Index'!A3");
  const index = book.Sheets["Receipt Index"]!;
  assert.equal(index["!ref"], "A1:C4");
  assert.equal(cellAt(index, "A1").v, "No. Resit");
  assert.equal(cellAt(index, "A3").v, 1);
  assert.equal(cellAt(index, "A4").v, 2);
  assert.equal(cellAt(index, "C3").v, 250);
  assert.equal(cellAt(index, "C4").w, "RM 3,000.00");
  assert.equal(cellAt(index, "C3").l!.Target, `Receipts/${b.id}_01.jpg`);
  assert.equal(cellAt(index, "C4").l!.Target, `Receipts/${b.id}_02.pdf`);
  assert.equal(cellAt(book.Sheets["Export Info"]!, "B6").f, "SUBTOTAL(109,'Collection Records'!A2:A3)");
  for (const s of Object.values(book.Sheets)) {
    const values = XLSX.utils.sheet_to_json<unknown[]>(s, { header: 1 }).flat();
    for (const excluded of [a.customerName, b.accountNumber, b.cardNumber, a.icNumber]) assert.ok(!values.includes(excluded));
  }
  assert.doesNotMatch(strFromU8(unzipSync(files[workbook])["xl/worksheets/sheet1.xml"]), /xSplit=/);
  const nameOnly = await createArchive([a], await outputDir(), new AbortController().signal, ["customerName"]);
  const nameFiles = unzipSync(await readFile(nameOnly.path));
  assert.deepEqual(nameFiles[Object.keys(nameFiles).find(name => name.endsWith("_01.jpg"))!], new Uint8Array(jpg));
  const nameBook = openWorkbook(nameFiles[Object.keys(nameFiles).find(name => name.endsWith(".xlsx"))!]);
  assert.deepEqual(nameBook.SheetNames, ["Collection Records", "Export Info"]);
  assert.equal(nameBook.Sheets["Collection Records"]["!ref"], "A1:A2");
  assert.ok(!JSON.stringify(nameBook.Sheets["Export Info"]).includes("Jumlah Bayaran"));
});

test("receipt-only export preserves missing and repeated amounts and indexes every attachment beyond the preview", async () => {
  const r = record(82);
  for (const amount of [null, "45.67", "45.67", "1.00", "2.00", "8.90"]) {
    const file = await attach(r, "pdf");
    file.receiptAmount = amount;
    file.extractedAmount = "999.99";
  }
  const result = await createArchive([r], await outputDir(), new AbortController().signal, ["receipt"]);
  const files = unzipSync(await readFile(result.path));
  const workbook = Object.keys(files).find(name => name.endsWith("/Collection_Selected.xlsx"))!;
  const book = openWorkbook(files[workbook]);
  const summary = cellAt(book.Sheets["Collection Records"]!, "A2");
  assert.equal(summary.l!.Target, "#'Receipt Index'!A2");
  const lines = String(summary.v).split("\n");
  assert.equal(lines.length, 6);
  assert.equal(lines[0], "Resit 1 · Amaun tidak direkodkan");
  assert.equal(lines[lines.length - 1], "Lihat semua 6 resit");
  const index = book.Sheets["Receipt Index"]!;
  const expected = ["Amaun tidak direkodkan", 45.67, 45.67, 1, 2, 8.9];
  expected.forEach((value, i) => {
    const link = columnCell(index, "Resit", i + 2);
    assert.equal(link.v, value);
    assert.equal(link.l!.Target, `Receipts/${r.id}_0${i + 1}.pdf`);
  });
});

test("missing, unreadable-content, duplicated or mismatched receipt metadata fails the complete archive", async () => {
  for (const kind of ["missing", "invalid-content", "wrong-owner", "duplicate", "archived", "count", "hash", "extension", "mime", "size"] as const) {
    const prior = record(20);
    await attach(prior, "pdf");
    const r = record(21);
    await attach(r, "jpg");
    const receipt = await attach(r, "png");
    if (kind === "missing") await rm(path.join(managed, path.basename(receipt.storagePath)));
    if (kind === "invalid-content") {
      const unknown = Buffer.alloc(png.length, 48);
      await writeFile(path.join(managed, path.basename(receipt.storagePath)), unknown);
      receipt.fileHash = createHash("sha256").update(unknown).digest("hex");
    }
    if (kind === "wrong-owner") receipt.collectionRecordId = id(22);
    if (kind === "duplicate") { r.receipts.push(receipt); r.receiptCount++; }
    if (kind === "archived") receipt.deletedAt = today;
    if (kind === "count") r.receiptCount++;
    if (kind === "hash") receipt.fileHash = "0".repeat(64);
    if (kind === "extension") receipt.originalExtension = ".jpg";
    if (kind === "mime") receipt.originalMimeType = "application/pdf";
    if (kind === "size") receipt.fileSize++;
    const dest = await outputDir();
    await assert.rejects(createArchive([prior, r], dest, new AbortController().signal), (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, "INVALID_RECEIPT");
      assert.deepEqual(error.details, {
        recordId: r.id, receiptNumber: kind === "count" ? null : kind === "duplicate" ? 3 : 2,
        receiptCount: r.receiptCount,
      });
      const exposed = JSON.stringify({ message: error.message, details: error.details });
      for (const value of [managed, receipt.storagePath, receipt.originalFileName, receipt.id, id(22),
        prior.id, r.customerName, r.cardNumber!, r.accountNumber]) assert.ok(!exposed.includes(value));
      return true;
    });
    assert.deepEqual(await readdir(dest), [], kind);
  }
});

test("unhydrated receipt references only identify the selected record and expected count", async () => {
  const r = record(24);
  r.receiptFile = "/uploads/collection-receipts/fixture-legacy.pdf";
  const dest = await outputDir();
  await assert.rejects(createArchive([r], dest, new AbortController().signal), {
    code: "INVALID_RECEIPT", statusCode: 409, details: { recordId: r.id, receiptNumber: null, receiptCount: 1 },
  });
  assert.deepEqual(await readdir(dest), []);
});

test("an invalid record identity is not echoed by receipt diagnostics", async () => {
  const r = record(25);
  r.id = "fixture-without-id";
  const dest = await outputDir();
  await assert.rejects(createArchive([r], dest, new AbortController().signal), {
    code: "INVALID_RECEIPT", statusCode: 409, details: undefined,
  });
  assert.deepEqual(await readdir(dest), []);
});

test("cancellation leaves no incomplete offline download", async () => {
  const r = record(30);
  await attach(r, "pdf");
  const dest = await outputDir();
  const controller = new AbortController();
  const pending = createArchive([r], dest, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.deepEqual(await readdir(dest), []);
});

for (const count of [1, 50, 500, 1000]) {
  test(`exports ${count} synthetic records with matching receipt indexes`, async context => {
    const records = Array.from({ length: count }, (_, i) => record(100 + i));
    const receipt = await attach(records[0], "pdf");
    for (const r of records.slice(1)) {
      // Distinct database receipts may reference identical stored bytes.
      r.receipts = [{ ...receipt, id: r.id, collectionRecordId: r.id }];
      r.receiptCount = 1;
    }
    const dest = await outputDir();
    const start = performance.now();
    let maxHeap = process.memoryUsage().heapUsed;
    const timer = setInterval(() => { maxHeap = Math.max(maxHeap, process.memoryUsage().heapUsed); }, 5);
    const result = await createArchive(records, dest, new AbortController().signal).finally(() => clearInterval(timer));
    maxHeap = Math.max(maxHeap, process.memoryUsage().heapUsed);
    context.diagnostic(`generation ${Math.round(performance.now() - start)} ms; sampled process heap ${(maxHeap / 1048576).toFixed(1)} MiB; process peak RSS ${(process.resourceUsage().maxRSS / 1024).toFixed(1)} MiB`);
    assert.equal(result.receiptCount, count);
    const files = unzipSync(await readFile(result.path));
    const name = Object.keys(files).find(entry => entry.endsWith("/Collection_Selected.xlsx"))!;
    const book = openWorkbook(files[name]);
    for (const sheet of ["Collection Records", "Receipt Index"]) {
      const range = XLSX.utils.decode_range(book.Sheets[sheet]!["!ref"]!);
      assert.equal(range.e.r, count);
      assert.equal(columnCell(book.Sheets[sheet]!, "Record ID", count + 1).v, records[count - 1].id);
    }
  });
}
