import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { sanitizeCollectionReceiptBuffer } from "../../lib/collection-receipt-security";
import {
  detectCollectionReceiptSignature,
  removeCollectionReceiptFile,
  saveMultipartCollectionReceipt,
  saveCollectionReceipt,
} from "../../routes/collection-receipt.service";

const originalQuarantineEnabled = process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED;
const originalQuarantineDir = process.env.COLLECTION_RECEIPT_QUARANTINE_DIR;
const originalExternalScanEnabled = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED;
const originalExternalScanCommand = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND;
const originalExternalScanArgsJson = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON;
const originalExternalScanTimeoutMs = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS;
const originalExternalScanFailClosed = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED;
const originalExternalScanCleanExitCodes = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_CLEAN_EXIT_CODES;
const originalExternalScanRejectExitCodes = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES;
process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED = "0";
delete process.env.COLLECTION_RECEIPT_QUARANTINE_DIR;
process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "0";
delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND;
delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON;
delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS;
delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED;
delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_CLEAN_EXIT_CODES;
delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES;

test.after(async () => {
  if (originalQuarantineEnabled === undefined) {
    delete process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED;
  } else {
    process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED = originalQuarantineEnabled;
  }

  if (originalQuarantineDir === undefined) {
    delete process.env.COLLECTION_RECEIPT_QUARANTINE_DIR;
  } else {
    process.env.COLLECTION_RECEIPT_QUARANTINE_DIR = originalQuarantineDir;
  }

  if (originalExternalScanEnabled === undefined) {
    delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED;
  } else {
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = originalExternalScanEnabled;
  }
  if (originalExternalScanCommand === undefined) {
    delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND;
  } else {
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = originalExternalScanCommand;
  }
  if (originalExternalScanArgsJson === undefined) {
    delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON;
  } else {
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = originalExternalScanArgsJson;
  }
  if (originalExternalScanTimeoutMs === undefined) {
    delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS;
  } else {
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS = originalExternalScanTimeoutMs;
  }
  if (originalExternalScanFailClosed === undefined) {
    delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED;
  } else {
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = originalExternalScanFailClosed;
  }
  if (originalExternalScanCleanExitCodes === undefined) {
    delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_CLEAN_EXIT_CODES;
  } else {
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_CLEAN_EXIT_CODES = originalExternalScanCleanExitCodes;
  }
  if (originalExternalScanRejectExitCodes === undefined) {
    delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES;
  } else {
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES = originalExternalScanRejectExitCodes;
  }

  await fs.rm(path.resolve(process.cwd(), "var", "collection-receipt-quarantine"), {
    recursive: true,
    force: true,
  });
});

function asBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

function createTinyPdfBuffer() {
  return Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "latin1");
}

function createDangerousPdfBuffer() {
  return Buffer.from(
    "%PDF-1.7\n1 0 obj\n<< /OpenAction 2 0 R >>\nendobj\n2 0 obj\n<< /JavaScript (app.alert('x')) >>\nendobj\ntrailer\n<<>>\n%%EOF\n",
    "latin1",
  );
}

function createScannablePdfBuffer(marker = "SAFE") {
  return Buffer.from(
    `%PDF-1.7\n1 0 obj\n<< /Producer (${marker}) >>\nendobj\ntrailer\n<<>>\n%%EOF\n`,
    "latin1",
  );
}

function createTinyPngBuffer(width = 1, height = 1) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([
      0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
      (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
      (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
      0x08, 0x06, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]),
    Buffer.from([
      0x00, 0x00, 0x00, 0x00,
      0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ]),
  ]);
}

function createTinyJpegBuffer(width = 1, height = 1) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
}

function createTinyWebpBuffer(width = 1, height = 1) {
  return Buffer.from([
    0x52, 0x49, 0x46, 0x46,
    0x16, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x58,
    0x0a, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    (width - 1) & 0xff, ((width - 1) >> 8) & 0xff, ((width - 1) >> 16) & 0xff,
    (height - 1) & 0xff, ((height - 1) >> 8) & 0xff, ((height - 1) >> 16) & 0xff,
  ]);
}

function createJpegWithExifMetadata() {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x16, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x65, 0x74, 0x61, 0x64, 0x61, 0x74, 0x61,
    0x2d, 0x54, 0x65, 0x73, 0x74, 0x21,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    0x00, 0x01,
    0x00, 0x01,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
}

function createPngWithTextMetadata() {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([
      0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00,
      0x1f, 0x15, 0xc4, 0x89,
    ]),
    Buffer.from([
      0x00, 0x00, 0x00, 0x09,
      0x74, 0x45, 0x58, 0x74,
      0x43, 0x6f, 0x6d, 0x6d, 0x65, 0x6e, 0x74, 0x00, 0x58,
      0x00, 0x00, 0x00, 0x00,
    ]),
    Buffer.from([
      0x00, 0x00, 0x00, 0x00,
      0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ]),
  ]);
}

test("detectCollectionReceiptSignature identifies supported signatures", () => {
  const pdf = createTinyPdfBuffer();
  const png = createTinyPngBuffer();
  const jpg = createTinyJpegBuffer();
  const webp = createTinyWebpBuffer();

  assert.equal(detectCollectionReceiptSignature(pdf), "pdf");
  assert.equal(detectCollectionReceiptSignature(png), "png");
  assert.equal(detectCollectionReceiptSignature(jpg), "jpg");
  assert.equal(detectCollectionReceiptSignature(webp), "webp");
  assert.equal(detectCollectionReceiptSignature(Buffer.from([0x00, 0x01, 0x02, 0x03])), null);
});

test("saveCollectionReceipt rejects extension-mismatch payloads", async () => {
  const pngBytes = createTinyPngBuffer();

  await assert.rejects(
    () =>
      saveCollectionReceipt({
        fileName: "receipt.pdf",
        mimeType: "application/pdf",
        contentBase64: asBase64(pngBytes),
      }),
    /does not match/i,
  );
});

test("saveCollectionReceipt accepts webp payloads and stores canonical metadata", async () => {
  const webpBytes = createTinyWebpBuffer();

  const saved = await saveCollectionReceipt({
    fileName: "scan.webp",
    mimeType: "image/webp",
    contentBase64: asBase64(webpBytes),
  });

  assert.equal(saved.originalExtension, ".webp");
  assert.equal(saved.originalMimeType, "image/webp");
  assert.match(saved.storagePath, /\/uploads\/collection-receipts\/.+\.webp$/);

  await removeCollectionReceiptFile(saved.storagePath);
});

test("saveCollectionReceipt accepts image/jpg alias MIME and stores canonical jpeg metadata", async () => {
  const jpgBytes = createTinyJpegBuffer();

  const saved = await saveCollectionReceipt({
    fileName: "mobile-upload.jpg",
    mimeType: "image/jpg",
    contentBase64: asBase64(jpgBytes),
  });

  assert.equal(saved.originalExtension, ".jpg");
  assert.equal(saved.originalMimeType, "image/jpeg");
  assert.match(saved.storagePath, /\/uploads\/collection-receipts\/.+\.jpg$/);

  await removeCollectionReceiptFile(saved.storagePath);
});

test("saveCollectionReceipt accepts image/jfif declarations when signature and extension are valid", async () => {
  const jpgBytes = createTinyJpegBuffer();

  const saved = await saveCollectionReceipt({
    fileName: "camera-export.jpeg",
    mimeType: "image/jfif",
    contentBase64: asBase64(jpgBytes),
  });

  assert.equal(saved.originalExtension, ".jpg");
  assert.equal(saved.originalMimeType, "image/jpeg");
  assert.match(saved.storagePath, /\/uploads\/collection-receipts\/.+\.jpg$/);

  await removeCollectionReceiptFile(saved.storagePath);
});

test("saveMultipartCollectionReceipt streams files to disk with canonical metadata", async () => {
  const pngBytes = createTinyPngBuffer();

  const saved = await saveMultipartCollectionReceipt({
    fileName: "stream-upload.png",
    mimeType: "image/png",
    stream: Readable.from([pngBytes]),
  });

  assert.equal(saved.originalExtension, ".png");
  assert.equal(saved.originalMimeType, "image/png");
  assert.match(saved.storagePath, /\/uploads\/collection-receipts\/.+\.png$/);

  await removeCollectionReceiptFile(saved.storagePath);
});

test("sanitizeCollectionReceiptBuffer strips JPEG EXIF metadata before storage", () => {
  const source = createJpegWithExifMetadata();

  const sanitized = sanitizeCollectionReceiptBuffer(source, "jpg");

  assert.equal(sanitized.strippedMetadata, true);
  assert.match(sanitized.removedMetadataKinds.join(","), /jpeg-exif/i);
  assert.equal(sanitized.imageWidth, 1);
  assert.equal(sanitized.imageHeight, 1);
  assert.ok(sanitized.buffer.length < source.length);
  assert.equal(sanitized.buffer.includes(Buffer.from("Exif\0\0", "latin1")), false);
});

test("sanitizeCollectionReceiptBuffer strips PNG text metadata before storage", () => {
  const source = createPngWithTextMetadata();

  const sanitized = sanitizeCollectionReceiptBuffer(source, "png");

  assert.equal(sanitized.strippedMetadata, true);
  assert.match(sanitized.removedMetadataKinds.join(","), /png-text/i);
  assert.equal(sanitized.imageWidth, 1);
  assert.equal(sanitized.imageHeight, 1);
  assert.ok(sanitized.buffer.length < source.length);
  assert.equal(sanitized.buffer.includes(Buffer.from("tEXt", "ascii")), false);
});

test("saveCollectionReceipt rejects PDF payloads that contain dangerous automatic actions", async () => {
  await assert.rejects(
    () =>
      saveCollectionReceipt({
        fileName: "dangerous.pdf",
        mimeType: "application/pdf",
        contentBase64: asBase64(createDangerousPdfBuffer()),
      }),
    /embedded JavaScript|automatic open actions/i,
  );
});

test("saveCollectionReceipt rejects images whose dimensions exceed the security limits", async () => {
  await assert.rejects(
    () =>
      saveCollectionReceipt({
        fileName: "oversized.png",
        mimeType: "image/png",
        contentBase64: asBase64(createTinyPngBuffer(10001, 1)),
      }),
    /maximum edge|maximum pixel/i,
  );
});

test("saveCollectionReceipt rejects PNG payloads with trailing data and quarantines the file", async () => {
  const quarantineDir = await fs.mkdtemp(path.join(os.tmpdir(), "receipt-quarantine-"));
  const previousEnabled = process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED;
  const previousDir = process.env.COLLECTION_RECEIPT_QUARANTINE_DIR;
  process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_QUARANTINE_DIR = quarantineDir;

  try {
    const suspicious = Buffer.concat([
      createTinyPngBuffer(),
      Buffer.from("MZ-suspicious-trailer", "latin1"),
    ]);

    await assert.rejects(
      () =>
        saveCollectionReceipt({
          fileName: "polyglot.png",
          mimeType: "image/png",
          contentBase64: asBase64(suspicious),
        }),
      /trailing data/i,
    );

    const quarantineEntries = await fs.readdir(quarantineDir);
    assert.equal(quarantineEntries.some((entry) => entry.endsWith(".png")), true);
    assert.equal(quarantineEntries.some((entry) => entry.endsWith(".json")), true);
  } finally {
    if (previousEnabled === undefined) {
      delete process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED;
    } else {
      process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED = previousEnabled;
    }
    if (previousDir === undefined) {
      delete process.env.COLLECTION_RECEIPT_QUARANTINE_DIR;
    } else {
      process.env.COLLECTION_RECEIPT_QUARANTINE_DIR = previousDir;
    }
    await fs.rm(quarantineDir, { recursive: true, force: true });
  }
});

test("saveMultipartCollectionReceipt quarantines suspicious files rejected by the security scan", async () => {
  const quarantineDir = await fs.mkdtemp(path.join(os.tmpdir(), "receipt-quarantine-multipart-"));
  const previousEnabled = process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED;
  const previousDir = process.env.COLLECTION_RECEIPT_QUARANTINE_DIR;
  process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_QUARANTINE_DIR = quarantineDir;

  try {
    const suspicious = Buffer.concat([
      createTinyWebpBuffer(),
      Buffer.from("appended-payload", "latin1"),
    ]);

    await assert.rejects(
      () =>
        saveMultipartCollectionReceipt({
          fileName: "polyglot.webp",
          mimeType: "image/webp",
          stream: Readable.from([suspicious]),
        }),
      /trailing data/i,
    );

    const quarantineEntries = await fs.readdir(quarantineDir);
    assert.equal(quarantineEntries.some((entry) => entry.endsWith(".webp")), true);
    assert.equal(quarantineEntries.some((entry) => entry.endsWith(".json")), true);
  } finally {
    if (previousEnabled === undefined) {
      delete process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED;
    } else {
      process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED = previousEnabled;
    }
    if (previousDir === undefined) {
      delete process.env.COLLECTION_RECEIPT_QUARANTINE_DIR;
    } else {
      process.env.COLLECTION_RECEIPT_QUARANTINE_DIR = previousDir;
    }
    await fs.rm(quarantineDir, { recursive: true, force: true });
  }
});

test("saveCollectionReceipt rejects files flagged by the external malware scanner and quarantines them", async () => {
  const quarantineDir = await fs.mkdtemp(path.join(os.tmpdir(), "receipt-external-scan-"));
  const previousQuarantineEnabled = process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED;
  const previousQuarantineDir = process.env.COLLECTION_RECEIPT_QUARANTINE_DIR;
  const previousExternalScanEnabled = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED;
  const previousExternalScanCommand = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND;
  const previousExternalScanArgsJson = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON;
  const previousExternalScanFailClosed = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED;
  const previousExternalScanRejectExitCodes = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES;

  process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_QUARANTINE_DIR = quarantineDir;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = process.execPath;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = JSON.stringify([
    "-e",
    "const fs = require('node:fs'); const filePath = process.argv[1]; const source = fs.readFileSync(filePath, 'latin1'); process.exit(source.includes('MALWARE-SCAN-MARKER') ? 1 : 0);",
    "{file}",
  ]);
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES = "1";

  try {
    await assert.rejects(
      () =>
        saveCollectionReceipt({
          fileName: "scanner.pdf",
          mimeType: "application/pdf",
          contentBase64: asBase64(createScannablePdfBuffer("MALWARE-SCAN-MARKER")),
        }),
      /external malware scan rejected/i,
    );

    const quarantineEntries = await fs.readdir(quarantineDir);
    assert.equal(quarantineEntries.some((entry) => entry.endsWith(".pdf")), true);
    assert.equal(quarantineEntries.some((entry) => entry.endsWith(".json")), true);
  } finally {
    if (previousQuarantineEnabled === undefined) {
      delete process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED;
    } else {
      process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED = previousQuarantineEnabled;
    }
    if (previousQuarantineDir === undefined) {
      delete process.env.COLLECTION_RECEIPT_QUARANTINE_DIR;
    } else {
      process.env.COLLECTION_RECEIPT_QUARANTINE_DIR = previousQuarantineDir;
    }
    if (previousExternalScanEnabled === undefined) {
      delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED;
    } else {
      process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = previousExternalScanEnabled;
    }
    if (previousExternalScanCommand === undefined) {
      delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND;
    } else {
      process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = previousExternalScanCommand;
    }
    if (previousExternalScanArgsJson === undefined) {
      delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON;
    } else {
      process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = previousExternalScanArgsJson;
    }
    if (previousExternalScanFailClosed === undefined) {
      delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED;
    } else {
      process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = previousExternalScanFailClosed;
    }
    if (previousExternalScanRejectExitCodes === undefined) {
      delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES;
    } else {
      process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES = previousExternalScanRejectExitCodes;
    }
    await fs.rm(quarantineDir, { recursive: true, force: true });
  }
});

test("saveCollectionReceipt can fail open when the external malware scanner is unavailable", async () => {
  const previousExternalScanEnabled = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED;
  const previousExternalScanCommand = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND;
  const previousExternalScanArgsJson = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON;
  const previousExternalScanFailClosed = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED;

  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = `${process.execPath}-missing`;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = JSON.stringify(["{file}"]);
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "0";

  try {
    const saved = await saveCollectionReceipt({
      fileName: "scanner-fail-open.pdf",
      mimeType: "application/pdf",
      contentBase64: asBase64(createScannablePdfBuffer("SAFE-SCAN-MARKER")),
    });

    assert.equal(saved.originalExtension, ".pdf");
    assert.equal(saved.originalMimeType, "application/pdf");

    await removeCollectionReceiptFile(saved.storagePath);
  } finally {
    if (previousExternalScanEnabled === undefined) {
      delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED;
    } else {
      process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = previousExternalScanEnabled;
    }
    if (previousExternalScanCommand === undefined) {
      delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND;
    } else {
      process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = previousExternalScanCommand;
    }
    if (previousExternalScanArgsJson === undefined) {
      delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON;
    } else {
      process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = previousExternalScanArgsJson;
    }
    if (previousExternalScanFailClosed === undefined) {
      delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED;
    } else {
      process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = previousExternalScanFailClosed;
    }
  }
});
