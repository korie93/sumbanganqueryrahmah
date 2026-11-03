import type { ImageDimensions } from "./collection-receipt-image-security-shared";
import { securityError, uniqueValues } from "./collection-receipt-image-security-shared";
import { CollectionReceiptSecurityError } from "./collection-receipt-security-shared";

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

const JPEG_STRIPPABLE_MARKERS = new Set([0xe1, 0xe2, 0xed, 0xfe]);

export function extractJpegDimensions(buffer: Buffer): ImageDimensions | null {
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

export function stripJpegMetadata(buffer: Buffer): { buffer: Buffer; removedMetadataKinds: string[] } {
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

// Shared structural walk. An offset is observational; callers must still enforce
// EOF before accepting an upload. Never locate EOI with a raw byte search: APP
// payloads and scan stuffing can contain bytes that resemble markers.
function findJpegEoiEndOffset(buffer: Buffer): number {
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
      return offset;
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
      let continueParsingMarkers = false;
      while (scanOffset + 1 < buffer.length) {
        if (buffer[scanOffset] !== 0xff) {
          scanOffset += 1;
          continue;
        }

        const markerStart = scanOffset;
        while (scanOffset < buffer.length && buffer[scanOffset] === 0xff) {
          scanOffset += 1;
        }
        if (scanOffset >= buffer.length) {
          break;
        }

        const next = buffer[scanOffset];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          scanOffset += 1;
          continue;
        }

        if (next === 0xd9) {
          scanOffset += 1;
          return scanOffset;
        }

        offset = markerStart;
        continueParsingMarkers = true;
        break;
      }

      if (continueParsingMarkers) {
        continue;
      }
      throw securityError("Receipt JPEG appears incomplete.", "jpeg-eoi-missing");
    }

    offset += segmentLength;
  }

  throw securityError("Receipt JPEG appears incomplete.", "jpeg-eoi-missing");
}

export function validateJpegStructure(buffer: Buffer): void {
  if (findJpegEoiEndOffset(buffer) !== buffer.length) {
    throw securityError("Receipt JPEG contains trailing data after the EOI marker.", "jpeg-trailing-data");
  }
}

export type JpegTrailingClassification =
  | "none"
  | "nul-only"
  | "ascii-whitespace-only"
  | "nul-and-ascii-whitespace"
  | "jpeg-signature-prefix"
  | "other"
  | "unavailable";

export type JpegStructureDiagnostic = {
  fileBytes: number;
  /** Zero-based exclusive end offset, including the parser-recognized FF D9. */
  eoiEndOffset: number | null;
  trailingBytes: number | null;
  trailingClassification: JpegTrailingClassification;
  reasonCode: string | null;
};

function classifyJpegTrailingBytes(buffer: Buffer, start: number): JpegTrailingClassification {
  if (start === buffer.length) return "none";
  if (buffer[start] === 0xff && buffer[start + 1] === 0xd8) return "jpeg-signature-prefix";

  let hasNul = false;
  let hasWhitespace = false;
  for (let offset = start; offset < buffer.length; offset += 1) {
    const byte = buffer[offset];
    if (byte === 0) {
      hasNul = true;
    } else if (byte === 0x20 || (byte >= 0x09 && byte <= 0x0d)) {
      hasWhitespace = true;
    } else {
      return "other";
    }
  }
  if (hasNul && hasWhitespace) return "nul-and-ascii-whitespace";
  return hasNul ? "nul-only" : "ascii-whitespace-only";
}

/** Read-only structural metadata. Classification never approves an upload. */
export function diagnoseJpegStructure(buffer: Buffer): JpegStructureDiagnostic {
  try {
    const eoiEndOffset = findJpegEoiEndOffset(buffer);
    return {
      fileBytes: buffer.length,
      eoiEndOffset,
      trailingBytes: buffer.length - eoiEndOffset,
      trailingClassification: classifyJpegTrailingBytes(buffer, eoiEndOffset),
      reasonCode: eoiEndOffset === buffer.length ? null : "jpeg-trailing-data",
    };
  } catch (error) {
    if (!(error instanceof CollectionReceiptSecurityError)) throw error;
    return {
      fileBytes: buffer.length,
      eoiEndOffset: null,
      trailingBytes: null,
      trailingClassification: "unavailable",
      reasonCode: error.reasonCode,
    };
  }
}
