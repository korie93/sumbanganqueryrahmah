import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const VENDOR_XLSX_DIRECTORY = "vendor/sheetjs";
export const VENDOR_XLSX_CHECKSUMS_FILE = "vendor/sheetjs/CHECKSUMS.sha512";

export function parseSha512ChecksumLine(rawLine) {
  const normalized = String(rawLine || "").trim();
  const match = normalized.match(/^([a-f0-9]{128})\s+\*?(.+)$/i);
  if (!match) {
    throw new Error("Invalid SHA512 checksum line.");
  }

  return {
    fileName: match[2].trim(),
    sha512: match[1].toLowerCase(),
  };
}

export async function readVendorXlsxChecksum({ cwd = process.cwd() } = {}) {
  const checksumPath = path.resolve(cwd, VENDOR_XLSX_CHECKSUMS_FILE);
  const checksumText = await readFile(checksumPath, "utf8");
  const checksumLine = checksumText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));

  if (!checksumLine) {
    throw new Error(`${VENDOR_XLSX_CHECKSUMS_FILE} does not contain a checksum entry.`);
  }

  return parseSha512ChecksumLine(checksumLine);
}

export async function computeFileSha512(filePath) {
  const payload = await readFile(filePath);
  return createHash("sha512").update(payload).digest("hex");
}

export async function verifyXlsxVendorIntegrity({ cwd = process.cwd() } = {}) {
  const expected = await readVendorXlsxChecksum({ cwd });
  const tarballPath = path.resolve(cwd, VENDOR_XLSX_DIRECTORY, expected.fileName);
  const actualSha512 = await computeFileSha512(tarballPath);

  if (actualSha512 !== expected.sha512) {
    throw new Error(
      `XLSX vendor tarball integrity mismatch for ${path.join(VENDOR_XLSX_DIRECTORY, expected.fileName)}. Expected ${expected.sha512}, got ${actualSha512}.`,
    );
  }

  return {
    filePath: path.join(VENDOR_XLSX_DIRECTORY, expected.fileName).replace(/\\/g, "/"),
    sha512: actualSha512,
  };
}
