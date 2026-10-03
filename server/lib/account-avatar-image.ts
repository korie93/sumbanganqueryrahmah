import path from "node:path";
import { crc32, inflateSync } from "node:zlib";
import { z } from "zod";
import {
  ACCOUNT_AVATAR_MAX_BASE64_LENGTH,
  ACCOUNT_AVATAR_MAX_BYTES,
  ACCOUNT_AVATAR_MAX_EDGE,
  ACCOUNT_AVATAR_MIME_TYPES,
} from "../../shared/account-avatar";
import { ERROR_CODES } from "../../shared/error-codes";
import { badRequest } from "../http/errors";
import { parseRequestBody } from "../http/validation";
import {
  CollectionReceiptSecurityError,
  detectCollectionReceiptSignature,
  sanitizeCollectionReceiptBuffer,
} from "./collection-receipt-security";

const avatarBodySchema = z.object({
  fileName: z.string().min(1).max(160),
  mimeType: z.enum(ACCOUNT_AVATAR_MIME_TYPES),
  contentBase64: z.string().min(4).max(ACCOUNT_AVATAR_MAX_BASE64_LENGTH),
}).strict();

const imageTypes = {
  png: { mimeType: "image/png", extensions: [".png"] },
  jpg: { mimeType: "image/jpeg", extensions: [".jpg", ".jpeg"] },
  webp: { mimeType: "image/webp", extensions: [".webp"] },
} as const;

function invalidAvatar(message = "Choose a valid PNG, JPEG or WebP image up to 1 MB.") {
  return badRequest(message, ERROR_CODES.REQUEST_BODY_INVALID);
}

// PNG IHDR combinations and Adam7 layout: https://www.w3.org/TR/png-3/#11IHDR
function validatePngScanlines(header: Buffer, compressed: Buffer) {
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header[8];
  const color = header[9];
  const colorModes: Record<number, { channels: number; depths: readonly number[] }> = {
    0: { channels: 1, depths: [1, 2, 4, 8, 16] },
    2: { channels: 3, depths: [8, 16] },
    3: { channels: 1, depths: [1, 2, 4, 8] },
    4: { channels: 2, depths: [8, 16] },
    6: { channels: 4, depths: [8, 16] },
  };
  const mode = colorModes[color];
  if (!mode || !mode.depths.includes(depth) || header[10] !== 0 || header[11] !== 0
    || (header[12] !== 0 && header[12] !== 1)
    || !width || !height || width > ACCOUNT_AVATAR_MAX_EDGE || height > ACCOUNT_AVATAR_MAX_EDGE) throw invalidAvatar();
  // Each non-empty Adam7 pass is an independent reduced image with its own
  // row filter bytes. Empty passes contribute no bytes (important for 1x1).
  const passes = header[12] === 1
    ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
    : [[0, 0, 1, 1]];
  const rows = passes.map(([startX, startY, stepX, stepY]) => {
    const columns = Math.max(0, Math.ceil((width - startX) / stepX));
    const rowCount = columns ? Math.max(0, Math.ceil((height - startY) / stepY)) : 0;
    return { rowCount, rowBytes: 1 + Math.ceil(columns * mode.channels * depth / 8) };
  });
  const expectedBytes = rows.reduce((sum, row) => sum + row.rowCount * row.rowBytes, 0);
  try {
    // Bound expansion to the exact declared image size, never an arbitrary
    // oversized stream. This also rejects truncated/extra decoded pixels.
    const pixels = inflateSync(compressed, { maxOutputLength: expectedBytes });
    if (pixels.length !== expectedBytes) throw invalidAvatar();
    let offset = 0;
    for (const { rowCount, rowBytes } of rows) {
      for (let row = 0; row < rowCount; row += 1) {
        if (pixels[offset] > 4) throw invalidAvatar();
        offset += rowBytes;
      }
    }
  } catch { throw invalidAvatar(); }
}

// Header-level checks, not an entropy decoder. T.81 Annex B.2.2/B.2.3:
// https://www.w3.org/Graphics/JPEG/itu-t81.pdf
function validateJpegHeaders(buffer: Buffer) {
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let frame: { marker: number; precision: number; components: Set<number> } | null = null;
  let sawScan = false;
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) throw invalidAvatar();
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd9) {
      if (!sawScan || offset !== buffer.length) throw invalidAvatar();
      return;
    }
    if (marker === 0x01) continue;
    if (marker === 0xd8 || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)
      || offset + 2 > buffer.length) throw invalidAvatar();
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) throw invalidAvatar();
    const data = buffer.subarray(offset + 2, offset + length);
    if (frameMarkers.has(marker)) {
      if (data.length < 6) throw invalidAvatar();
      const precision = data[0];
      const height = data.readUInt16BE(1);
      const width = data.readUInt16BE(3);
      const count = data[5];
      const lossless = (marker & 3) === 3;
      const progressive = (marker & 3) === 2;
      if (!count || data.length !== 6 + 3 * count || (progressive && count > 4)
        || !width || !height || width > ACCOUNT_AVATAR_MAX_EDGE || height > ACCOUNT_AVATAR_MAX_EDGE
        || (lossless ? precision < 2 || precision > 16 : ![8, 12].includes(precision))
        || (marker === 0xc0 && precision !== 8)) throw invalidAvatar();
      const components = new Set<number>();
      for (let index = 6; index < data.length; index += 3) {
        const horizontal = data[index + 1] >> 4;
        const vertical = data[index + 1] & 15;
        if (components.has(data[index]) || horizontal < 1 || horizontal > 4 || vertical < 1 || vertical > 4
          || data[index + 2] > (lossless ? 0 : 3)) throw invalidAvatar();
        components.add(data[index]);
      }
      frame = { marker, precision, components };
    }
    offset += length;
    if (marker !== 0xda) continue;
    if (!frame || data.length < 4 || !data[0] || data[0] > 4 || data.length !== 4 + 2 * data[0]) throw invalidAvatar();
    const scanComponents = new Set<number>();
    const lossless = (frame.marker & 3) === 3;
    const progressive = (frame.marker & 3) === 2;
    for (let index = 1; index < data.length - 3; index += 2) {
      const dcTable = data[index + 1] >> 4;
      const acTable = data[index + 1] & 15;
      const tableLimit = frame.marker === 0xc0 ? 1 : 3;
      if (!frame.components.has(data[index]) || scanComponents.has(data[index])
        || dcTable > tableLimit || acTable > (lossless ? 0 : tableLimit)) throw invalidAvatar();
      scanComponents.add(data[index]);
    }
    const start = data[data.length - 3];
    const end = data[data.length - 2];
    const high = data[data.length - 1] >> 4;
    const low = data[data.length - 1] & 15;
    if (lossless) {
      if (start < 1 || start > 7 || end !== 0 || high !== 0 || low >= frame.precision) throw invalidAvatar();
    } else if (progressive) {
      if (start > 63 || end < start || end > 63 || (start === 0 && end !== 0)
        || (start > 0 && scanComponents.size !== 1) || high > 13 || low > 13
        || (high !== 0 && high !== low + 1)) throw invalidAvatar();
    } else if (start !== 0 || end !== 63 || high !== 0 || low !== 0) throw invalidAvatar();
    sawScan = true;
    const scanStart = offset;
    // Skip stuffed bytes/restart markers, but inspect every subsequent SOS in
    // progressive JPEGs instead of mistaking its next scan for trailing data.
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      let next = offset + 1;
      while (buffer[next] === 0xff) next += 1;
      if (buffer[next] === 0 || (buffer[next] >= 0xd0 && buffer[next] <= 0xd7)) { offset = next + 1; continue; }
      break;
    }
    if (offset === scanStart) throw invalidAvatar();
  }
  throw invalidAvatar();
}

type ImageSize = { width: number; height: number };
type WebpChunk = { type: string; data: Buffer };

function webpChunks(buffer: Buffer, start = 0): WebpChunk[] {
  const chunks: WebpChunk[] = [];
  for (let offset = start; offset < buffer.length;) {
    if (offset + 8 > buffer.length) throw invalidAvatar();
    const length = buffer.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    if (end + (length % 2) > buffer.length || (length % 2 && buffer[end] !== 0)) throw invalidAvatar();
    chunks.push({ type: buffer.toString("ascii", offset, offset + 4), data: buffer.subarray(offset + 8, end) });
    offset = end + (length % 2);
  }
  return chunks;
}

// WebP framing/alpha: https://developers.google.com/speed/webp/docs/riff_container
// VP8: https://datatracker.ietf.org/doc/html/rfc6386#section-9.1
// VP8L: https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification
function validateWebpFrame(chunks: WebpChunk[], expected?: ImageSize) {
  let image: ImageSize | null = null;
  let alpha: Buffer | null = null;
  for (const { type, data } of chunks) {
    if (type === "ALPH") {
      if (alpha || image || data.length < 2 || (data[0] & 0xc0) !== 0
        || (data[0] & 3) > 1 || ((data[0] >> 4) & 3) > 1) throw invalidAvatar();
      alpha = data;
    } else if (type === "VP8 " || type === "VP8L") {
      if (image) throw invalidAvatar();
      if (type === "VP8 ") {
        if (data.length <= 10) throw invalidAvatar();
        const tag = data.readUIntLE(0, 3);
        const partitionLength = tag >>> 5;
        if ((tag & 1) !== 0 || ((tag >> 1) & 7) > 3 || (tag & 16) === 0
          || data.readUIntBE(3, 3) !== 0x9d012a || !partitionLength || partitionLength > data.length - 10) throw invalidAvatar();
        image = { width: data.readUInt16LE(6) & 0x3fff, height: data.readUInt16LE(8) & 0x3fff };
      } else {
        if (alpha || data.length <= 5 || data[0] !== 0x2f || (data[4] >> 5) !== 0) throw invalidAvatar();
        const bits = data.readUInt32LE(1);
        image = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
      }
      if (!image.width || !image.height || image.width > ACCOUNT_AVATAR_MAX_EDGE || image.height > ACCOUNT_AVATAR_MAX_EDGE
        || (expected && (image.width !== expected.width || image.height !== expected.height))
        || (alpha && (alpha[0] & 3) === 0 && alpha.length !== 1 + image.width * image.height)) throw invalidAvatar();
    } else if (["VP8X", "ANIM", "ANMF"].includes(type)) throw invalidAvatar();
  }
  if (!image) throw invalidAvatar();
}

function validateWebpHeaders(buffer: Buffer) {
  const chunks = webpChunks(buffer, 12);
  const header = chunks[0]?.type === "VP8X" ? chunks.shift()!.data : null;
  if (header && (header.length !== 10 || (header[0] & 0xc1) !== 0 || header.readUIntLE(1, 3) !== 0)) throw invalidAvatar();
  const canvas = header ? { width: header.readUIntLE(4, 3) + 1, height: header.readUIntLE(7, 3) + 1 } : undefined;
  if (!header || (header[0] & 2) === 0) {
    validateWebpFrame(chunks, canvas);
    return;
  }
  let animationFound = false;
  let frames = 0;
  for (const { type, data } of chunks) {
    if (type === "ANIM") {
      if (animationFound || frames || data.length !== 6) throw invalidAvatar();
      animationFound = true;
    } else if (type === "ANMF") {
      if (!animationFound || data.length < 16 || (data[15] & 0xfc) !== 0) throw invalidAvatar();
      const width = data.readUIntLE(6, 3) + 1;
      const height = data.readUIntLE(9, 3) + 1;
      if (data.readUIntLE(0, 3) * 2 + width > canvas!.width || data.readUIntLE(3, 3) * 2 + height > canvas!.height) throw invalidAvatar();
      validateWebpFrame(webpChunks(data, 16), { width, height });
      frames += 1;
    } else if (["VP8X", "VP8 ", "VP8L", "ALPH"].includes(type)) throw invalidAvatar();
  }
  if (!frames) throw invalidAvatar();
}

function validateAvatarImagePayload(buffer: Buffer, type: "png" | "jpg" | "webp") {
  if (type === "png") {
    const imageChunks: Buffer[] = [];
    let header: Buffer | null = null;
    let sawPalette = false;
    let imageEnded = false;
    for (let offset = 8; offset + 12 <= buffer.length;) {
      const length = buffer.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (end > buffer.length) throw invalidAvatar();
      const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
      if (!/^[A-Za-z]{4}$/.test(chunkType)
        || crc32(buffer.subarray(offset + 4, end - 4)) !== buffer.readUInt32BE(end - 4)) throw invalidAvatar();
      if (chunkType === "IHDR") {
        if (offset !== 8 || header || length !== 13) throw invalidAvatar();
        header = buffer.subarray(offset + 8, end - 4);
      } else if (!header) throw invalidAvatar();
      if (chunkType === "PLTE") {
        if (!header || sawPalette || imageChunks.length || length === 0 || length % 3 !== 0 || length > 768
          || header[9] === 0 || header[9] === 4
          || (header[9] === 3 && length / 3 > 2 ** header[8])) throw invalidAvatar();
        sawPalette = true;
      }
      if (chunkType === "IDAT") {
        if (imageEnded || (header?.[9] === 3 && !sawPalette)) throw invalidAvatar();
        imageChunks.push(buffer.subarray(offset + 8, end - 4));
      } else if (imageChunks.length) imageEnded = true;
      if (chunkType === "IEND" && length !== 0) throw invalidAvatar();
      offset = end;
    }
    if (!header || !imageChunks.length) throw invalidAvatar();
    validatePngScanlines(header, Buffer.concat(imageChunks));
  } else if (type === "jpg") {
    validateJpegHeaders(buffer);
  } else {
    validateWebpHeaders(buffer);
  }
}

export function inspectStoredAvatar(buffer: Buffer) {
  const type = detectCollectionReceiptSignature(buffer);
  if (!type || type === "pdf" || buffer.length > ACCOUNT_AVATAR_MAX_BYTES) throw invalidAvatar();
  return { type, mimeType: imageTypes[type].mimeType };
}

export function validateAccountAvatarUpload(bodyRaw: unknown) {
  const body = parseRequestBody(avatarBodySchema, bodyRaw);
  // Client names are validated but never used as storage paths or response headers.
  if (
    /[\\/:]/.test(body.fileName)
    || [...body.fileName].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    || body.fileName.startsWith(".")
    || body.fileName !== body.fileName.trim()
    || body.fileName.includes("..")
  ) throw invalidAvatar("The photo filename is not valid.");
  if (body.contentBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.contentBase64)) {
    throw invalidAvatar();
  }
  const buffer = Buffer.from(body.contentBase64, "base64");
  if (buffer.toString("base64") !== body.contentBase64) throw invalidAvatar();
  const { type, mimeType } = inspectStoredAvatar(buffer);
  const extensions: readonly string[] = imageTypes[type].extensions;
  if (body.mimeType !== mimeType || !extensions.includes(path.extname(body.fileName).toLowerCase())) {
    throw invalidAvatar("The photo content, filename and image type must match.");
  }
  try {
    const sanitized = sanitizeCollectionReceiptBuffer(buffer, type);
    if (!sanitized.imageWidth || !sanitized.imageHeight
      || sanitized.imageWidth > ACCOUNT_AVATAR_MAX_EDGE || sanitized.imageHeight > ACCOUNT_AVATAR_MAX_EDGE) {
      throw invalidAvatar("Choose a photo no larger than 2048 by 2048 pixels.");
    }
    validateAvatarImagePayload(sanitized.buffer, type);
    return { buffer: sanitized.buffer, mimeType };
  } catch (error) {
    if (error instanceof CollectionReceiptSecurityError) throw invalidAvatar();
    throw error;
  }
}
