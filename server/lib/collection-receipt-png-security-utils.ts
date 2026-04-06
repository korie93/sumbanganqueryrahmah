import type { ImageDimensions } from "./collection-receipt-image-security-shared";
import { securityError, uniqueValues } from "./collection-receipt-image-security-shared";

const PNG_METADATA_CHUNK_TYPES = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "iCCP", "tIME"]);

export function extractPngDimensions(buffer: Buffer): ImageDimensions | null {
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

export function validatePngStructure(buffer: Buffer) {
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

export function stripPngMetadata(buffer: Buffer): { buffer: Buffer; removedMetadataKinds: string[] } {
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
