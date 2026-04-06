import {
  readUInt24LE,
  securityError,
  uniqueValues,
  type ImageDimensions,
} from "./collection-receipt-image-security-shared";

const WEBP_METADATA_CHUNK_TYPES = new Set(["EXIF", "XMP ", "ICCP"]);

export function extractWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
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
        buffer[payloadOffset + 3] !== 0x9d ||
        buffer[payloadOffset + 4] !== 0x01 ||
        buffer[payloadOffset + 5] !== 0x2a
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

export function validateWebpStructure(buffer: Buffer) {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
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

export function stripWebpMetadata(buffer: Buffer): { buffer: Buffer; removedMetadataKinds: string[] } {
  if (
    buffer.length < 12 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
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
