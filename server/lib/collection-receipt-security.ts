export type CollectionReceiptFileType = "pdf" | "png" | "jpg" | "webp";
export class CollectionReceiptSecurityError extends Error {
  reasonCode: string;

  constructor(message: string, reasonCode = "receipt-security-rejected") {
    super(message);
    this.name = "CollectionReceiptSecurityError";
    this.reasonCode = reasonCode;
  }
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf,
]);

const DANGEROUS_PDF_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\/javascript\b/i, reason: "contains embedded JavaScript" },
  { pattern: /\/openaction\b/i, reason: "contains automatic open actions" },
  { pattern: /\/aa\b/i, reason: "contains additional automatic actions" },
  { pattern: /\/launch\b/i, reason: "contains launch actions" },
  { pattern: /\/richmedia\b/i, reason: "contains rich media content" },
  { pattern: /\/embeddedfile\b/i, reason: "contains embedded files" },
  { pattern: /\/submitform\b/i, reason: "contains submit-form actions" },
  { pattern: /\/importdata\b/i, reason: "contains import-data actions" },
];
const PNG_METADATA_CHUNK_TYPES = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "iCCP", "tIME"]);
const WEBP_METADATA_CHUNK_TYPES = new Set(["EXIF", "XMP ", "ICCP"]);
const JPEG_STRIPPABLE_MARKERS = new Set([0xe1, 0xe2, 0xed, 0xfe]);

export const COLLECTION_RECEIPT_MAX_IMAGE_EDGE = 10_000;
export const COLLECTION_RECEIPT_MAX_IMAGE_PIXELS = 40_000_000;

type ImageDimensions = { width: number; height: number };
export type CollectionReceiptSecurityResult = {
  buffer: Buffer;
  strippedMetadata: boolean;
  removedMetadataKinds: string[];
  imageWidth?: number;
  imageHeight?: number;
};

function securityError(message: string, reasonCode: string): CollectionReceiptSecurityError {
  return new CollectionReceiptSecurityError(message, reasonCode);
}

function readUInt24LE(buffer: Buffer, offset: number): number | null {
  if (offset < 0 || offset + 2 >= buffer.length) {
    return null;
  }

  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16);
}

function extractPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) {
    return null;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height) {
    return null;
  }

  return { width, height };
}

function extractJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 1 < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }

    if (offset >= buffer.length) {
      return null;
    }

    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (offset + 1 >= buffer.length) {
      return null;
    }

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      return null;
    }

    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) {
        return null;
      }

      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      if (!width || !height) {
        return null;
      }

      return { width, height };
    }

    offset += segmentLength;
  }

  return null;
}

function extractWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (
    buffer.length < 30
    || buffer.toString("ascii", 0, 4) !== "RIFF"
    || buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;
    const nextOffset = payloadOffset + chunkSize + (chunkSize % 2);
    if (nextOffset > buffer.length) {
      return null;
    }

    if (chunkType === "VP8X") {
      const widthMinusOne = readUInt24LE(buffer, payloadOffset + 4);
      const heightMinusOne = readUInt24LE(buffer, payloadOffset + 7);
      if (widthMinusOne === null || heightMinusOne === null) {
        return null;
      }

      return {
        width: widthMinusOne + 1,
        height: heightMinusOne + 1,
      };
    }

    if (chunkType === "VP8 " && payloadOffset + 10 <= buffer.length) {
      if (
        buffer[payloadOffset + 3] !== 0x9d
        || buffer[payloadOffset + 4] !== 0x01
        || buffer[payloadOffset + 5] !== 0x2a
      ) {
        return null;
      }

      const width = buffer.readUInt16LE(payloadOffset + 6) & 0x3fff;
      const height = buffer.readUInt16LE(payloadOffset + 8) & 0x3fff;
      if (!width || !height) {
        return null;
      }

      return { width, height };
    }

    if (chunkType === "VP8L" && payloadOffset + 5 <= buffer.length) {
      if (buffer[payloadOffset] !== 0x2f) {
        return null;
      }

      const b1 = buffer[payloadOffset + 1];
      const b2 = buffer[payloadOffset + 2];
      const b3 = buffer[payloadOffset + 3];
      const b4 = buffer[payloadOffset + 4];
      const width = 1 + (b1 | ((b2 & 0x3f) << 8));
      const height = 1 + (((b2 & 0xc0) >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
      if (!width || !height) {
        return null;
      }

      return { width, height };
    }

    offset = nextOffset;
  }

  return null;
}

function validateImageDimensions(
  dimensions: { width: number; height: number } | null,
): { width: number; height: number } {
  if (!dimensions) {
    throw securityError("Receipt image dimensions could not be verified.", "image-dimensions-unverified");
  }

  const { width, height } = dimensions;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw securityError("Receipt image dimensions are invalid.", "image-dimensions-invalid");
  }

  if (width > COLLECTION_RECEIPT_MAX_IMAGE_EDGE || height > COLLECTION_RECEIPT_MAX_IMAGE_EDGE) {
    throw securityError(
      `Receipt image dimensions exceed the ${COLLECTION_RECEIPT_MAX_IMAGE_EDGE}px maximum edge.`,
      "image-dimensions-edge-exceeded",
    );
  }

  if (width * height > COLLECTION_RECEIPT_MAX_IMAGE_PIXELS) {
    throw securityError(
      "Receipt image dimensions exceed the maximum pixel allowance.",
      "image-dimensions-pixel-exceeded",
    );
  }

  return { width, height };
}

function validatePdfBuffer(buffer: Buffer) {
  if (buffer.length < 8 || buffer.toString("latin1", 0, 5) !== "%PDF-") {
    throw securityError("Receipt PDF header is invalid.", "pdf-header-invalid");
  }

  const source = buffer.toString("latin1");
  const loweredSource = source.toLowerCase();
  const eofIndex = loweredSource.lastIndexOf("%%eof");
  if (eofIndex < 0) {
    throw securityError("Receipt PDF appears incomplete.", "pdf-eof-missing");
  }

  const trailingSource = source.slice(eofIndex + 5);
  if (/\S/.test(trailingSource)) {
    throw securityError("Receipt PDF contains trailing data after the EOF marker.", "pdf-trailing-data");
  }

  for (const rule of DANGEROUS_PDF_PATTERNS) {
    if (rule.pattern.test(source)) {
      throw securityError(`Receipt PDF ${rule.reason}.`, "pdf-dangerous-content");
    }
  }
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function describeJpegMarker(marker: number, segmentData: Buffer): string {
  if (marker === 0xe1) {
    const header = segmentData.subarray(0, 32).toString("latin1");
    if (header.startsWith("Exif\0\0")) return "jpeg-exif";
    if (header.includes("http://ns.adobe.com/xap/1.0/")) return "jpeg-xmp";
    return "jpeg-app1";
  }
  if (marker === 0xe2) return "jpeg-icc";
  if (marker === 0xed) return "jpeg-iptc";
  if (marker === 0xfe) return "jpeg-comment";
  return "jpeg-metadata";
}

function stripJpegMetadata(buffer: Buffer): { buffer: Buffer; removedMetadataKinds: string[] } {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return { buffer, removedMetadataKinds: [] };
  }

  const output: Buffer[] = [buffer.subarray(0, 2)];
  const removedMetadataKinds: string[] = [];
  let offset = 2;

  while (offset + 1 < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= buffer.length) {
      return { buffer, removedMetadataKinds: [] };
    }

    const marker = buffer[offset];
    const markerStart = offset - 1;
    offset += 1;

    if (marker === 0xd9) {
      output.push(buffer.subarray(markerStart, Math.min(markerStart + 2, buffer.length)));
      break;
    }

    if (marker === 0xda) {
      if (offset + 1 >= buffer.length) {
        return { buffer, removedMetadataKinds: [] };
      }
      output.push(buffer.subarray(markerStart, buffer.length));
      return {
        buffer: Buffer.concat(output),
        removedMetadataKinds: uniqueValues(removedMetadataKinds),
      };
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      output.push(buffer.subarray(markerStart, Math.min(markerStart + 2, buffer.length)));
      continue;
    }

    if (offset + 1 >= buffer.length) {
      return { buffer, removedMetadataKinds: [] };
    }

    const segmentLength = buffer.readUInt16BE(offset);
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > buffer.length) {
      return { buffer, removedMetadataKinds: [] };
    }

    const segmentData = buffer.subarray(offset + 2, segmentEnd);
    if (JPEG_STRIPPABLE_MARKERS.has(marker)) {
      removedMetadataKinds.push(describeJpegMarker(marker, segmentData));
    } else {
      output.push(buffer.subarray(markerStart, segmentEnd));
    }

    offset = segmentEnd;
  }

  return {
    buffer: removedMetadataKinds.length ? Buffer.concat(output) : buffer,
    removedMetadataKinds: uniqueValues(removedMetadataKinds),
  };
}

function validatePngStructure(buffer: Buffer) {
  if (buffer.length < 8) {
    throw securityError("Receipt PNG header is invalid.", "png-header-invalid");
  }

  let offset = 8;
  let sawIend = false;
  while (offset + 12 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
    const chunkTotal = 12 + chunkLength;
    const chunkEnd = offset + chunkTotal;
    if (chunkEnd > buffer.length) {
      throw securityError("Receipt PNG appears incomplete.", "png-incomplete");
    }

    offset = chunkEnd;
    if (chunkType === "IEND") {
      sawIend = true;
      break;
    }
  }

  if (!sawIend) {
    throw securityError("Receipt PNG appears incomplete.", "png-iend-missing");
  }

  if (offset !== buffer.length) {
    throw securityError("Receipt PNG contains trailing data after the IEND chunk.", "png-trailing-data");
  }
}

function validateJpegStructure(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw securityError("Receipt JPEG header is invalid.", "jpeg-header-invalid");
  }

  let offset = 2;
  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }

    if (offset >= buffer.length) {
      break;
    }

    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9) {
      if (offset !== buffer.length) {
        throw securityError("Receipt JPEG contains trailing data after the EOI marker.", "jpeg-trailing-data");
      }
      return;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (offset + 1 >= buffer.length) {
      throw securityError("Receipt JPEG appears incomplete.", "jpeg-incomplete");
    }

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      throw securityError("Receipt JPEG segment structure is invalid.", "jpeg-segment-invalid");
    }

    if (marker === 0xda) {
      let scanOffset = offset + segmentLength;
      while (scanOffset + 1 < buffer.length) {
        if (buffer[scanOffset] !== 0xff) {
          scanOffset += 1;
          continue;
        }

        const next = buffer[scanOffset + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          scanOffset += 2;
          continue;
        }

        if (next === 0xd9) {
          scanOffset += 2;
          if (scanOffset !== buffer.length) {
            throw securityError(
              "Receipt JPEG contains trailing data after the EOI marker.",
              "jpeg-trailing-data",
            );
          }
          return;
        }

        throw securityError("Receipt JPEG scan data is malformed.", "jpeg-scan-malformed");
      }

      throw securityError("Receipt JPEG appears incomplete.", "jpeg-eoi-missing");
    }

    offset += segmentLength;
  }

  throw securityError("Receipt JPEG appears incomplete.", "jpeg-eoi-missing");
}

function validateWebpStructure(buffer: Buffer) {
  if (
    buffer.length < 30
    || buffer.toString("ascii", 0, 4) !== "RIFF"
    || buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw securityError("Receipt WebP header is invalid.", "webp-header-invalid");
  }

  const riffSize = buffer.readUInt32LE(4);
  const expectedLength = riffSize + 8;
  if (expectedLength > buffer.length) {
    throw securityError("Receipt WebP appears incomplete.", "webp-incomplete");
  }
  if (expectedLength < buffer.length) {
    throw securityError("Receipt WebP contains trailing data after the RIFF payload.", "webp-trailing-data");
  }

  let offset = 12;
  let sawImageChunk = false;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;
    const nextOffset = payloadOffset + chunkSize + (chunkSize % 2);
    if (nextOffset > buffer.length) {
      throw securityError("Receipt WebP chunk structure is invalid.", "webp-chunk-invalid");
    }

    if (chunkType === "VP8X" || chunkType === "VP8 " || chunkType === "VP8L") {
      sawImageChunk = true;
    }

    offset = nextOffset;
  }

  if (!sawImageChunk) {
    throw securityError("Receipt WebP image payload is missing.", "webp-image-missing");
  }
}

function stripPngMetadata(buffer: Buffer): { buffer: Buffer; removedMetadataKinds: string[] } {
  if (buffer.length < 8) {
    return { buffer, removedMetadataKinds: [] };
  }

  const output: Buffer[] = [buffer.subarray(0, 8)];
  const removedMetadataKinds: string[] = [];
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
    const chunkTotal = 12 + chunkLength;
    const chunkEnd = offset + chunkTotal;
    if (chunkEnd > buffer.length) {
      return { buffer, removedMetadataKinds: [] };
    }

    if (PNG_METADATA_CHUNK_TYPES.has(chunkType)) {
      removedMetadataKinds.push(`png-${chunkType.toLowerCase()}`);
    } else {
      output.push(buffer.subarray(offset, chunkEnd));
    }

    offset = chunkEnd;
    if (chunkType === "IEND") {
      break;
    }
  }

  return {
    buffer: removedMetadataKinds.length ? Buffer.concat(output) : buffer,
    removedMetadataKinds: uniqueValues(removedMetadataKinds),
  };
}

function stripWebpMetadata(buffer: Buffer): { buffer: Buffer; removedMetadataKinds: string[] } {
  if (
    buffer.length < 12
    || buffer.toString("ascii", 0, 4) !== "RIFF"
    || buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return { buffer, removedMetadataKinds: [] };
  }

  const keptChunks: Buffer[] = [];
  const removedMetadataKinds: string[] = [];
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkTotal = 8 + chunkSize + (chunkSize % 2);
    const chunkEnd = offset + chunkTotal;
    if (chunkEnd > buffer.length) {
      return { buffer, removedMetadataKinds: [] };
    }

    if (WEBP_METADATA_CHUNK_TYPES.has(chunkType)) {
      removedMetadataKinds.push(`webp-${chunkType.trim().toLowerCase()}`);
    } else {
      keptChunks.push(buffer.subarray(offset, chunkEnd));
    }

    offset = chunkEnd;
  }

  if (!removedMetadataKinds.length) {
    return { buffer, removedMetadataKinds: [] };
  }

  const riffSize = 4 + keptChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(riffSize, 4);
  header.write("WEBP", 8, "ascii");

  return {
    buffer: Buffer.concat([header, ...keptChunks]),
    removedMetadataKinds: uniqueValues(removedMetadataKinds),
  };
}

function sanitizeCollectionReceiptImageBuffer(
  buffer: Buffer,
  signatureType: Exclude<CollectionReceiptFileType, "pdf">,
): { buffer: Buffer; removedMetadataKinds: string[]; dimensions: ImageDimensions } {
  if (signatureType === "png") {
    validatePngStructure(buffer);
  } else if (signatureType === "jpg") {
    validateJpegStructure(buffer);
  } else {
    validateWebpStructure(buffer);
  }

  const stripped = signatureType === "png"
    ? stripPngMetadata(buffer)
    : signatureType === "jpg"
      ? stripJpegMetadata(buffer)
      : stripWebpMetadata(buffer);
  const sanitizedBuffer = stripped.buffer;
  if (signatureType === "png") {
    validatePngStructure(sanitizedBuffer);
  } else if (signatureType === "jpg") {
    validateJpegStructure(sanitizedBuffer);
  } else {
    validateWebpStructure(sanitizedBuffer);
  }
  const dimensions = signatureType === "png"
    ? extractPngDimensions(sanitizedBuffer)
    : signatureType === "jpg"
      ? extractJpegDimensions(sanitizedBuffer)
      : extractWebpDimensions(sanitizedBuffer);
  const validated = validateImageDimensions(dimensions);

  return {
    buffer: sanitizedBuffer,
    removedMetadataKinds: stripped.removedMetadataKinds,
    dimensions: validated,
  };
}

export function detectCollectionReceiptSignature(buffer: Buffer): CollectionReceiptFileType | null {
  if (!buffer || buffer.length < 4) {
    return null;
  }

  if (
    buffer.length >= 5
    && buffer[0] === 0x25
    && buffer[1] === 0x50
    && buffer[2] === 0x44
    && buffer[3] === 0x46
    && buffer[4] === 0x2d
  ) {
    return "pdf";
  }

  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return "png";
  }

  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) {
    return "jpg";
  }

  if (
    buffer.length >= 12
    && buffer[0] === 0x52
    && buffer[1] === 0x49
    && buffer[2] === 0x46
    && buffer[3] === 0x46
    && buffer[8] === 0x57
    && buffer[9] === 0x45
    && buffer[10] === 0x42
    && buffer[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}

export function validateCollectionReceiptSecurity(
  buffer: Buffer,
  signatureType: CollectionReceiptFileType,
): { imageWidth?: number; imageHeight?: number } {
  const result = sanitizeCollectionReceiptBuffer(buffer, signatureType);
  return {
    imageWidth: result.imageWidth,
    imageHeight: result.imageHeight,
  };
}

export function sanitizeCollectionReceiptBuffer(
  buffer: Buffer,
  signatureType: CollectionReceiptFileType,
): CollectionReceiptSecurityResult {
  if (signatureType === "pdf") {
    validatePdfBuffer(buffer);
    return {
      buffer,
      strippedMetadata: false,
      removedMetadataKinds: [],
    };
  }

  const sanitized = sanitizeCollectionReceiptImageBuffer(buffer, signatureType);

  return {
    buffer: sanitized.buffer,
    strippedMetadata: sanitized.removedMetadataKinds.length > 0,
    removedMetadataKinds: sanitized.removedMetadataKinds,
    imageWidth: sanitized.dimensions.width,
    imageHeight: sanitized.dimensions.height,
  };
}
