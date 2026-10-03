import assert from "node:assert/strict";
import test from "node:test";
import { crc32, deflateSync } from "node:zlib";
import { ACCOUNT_AVATAR_MAX_BYTES } from "../../../shared/account-avatar";
import { validateAccountAvatarUpload } from "../account-avatar-image";

function chunk(type: string, data: Buffer) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  result.write(type, 4, "ascii");
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, result.length - 4)), result.length - 4);
  return result;
}

function png(width = 1, height = 1) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header),
    chunk("tEXt", Buffer.from("PrivateComment\0not-retained")),
    chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const upload = (buffer = png()) => ({ fileName: "photo.png", mimeType: "image/png", contentBase64: buffer.toString("base64") });

function pngWithRaster(options: {
  width?: number; height?: number; depth?: number; color?: number;
  compression?: number; filterMethod?: number; interlace?: number;
  pixels: Buffer; palette?: Buffer; transparency?: Buffer;
}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(options.width ?? 1, 0);
  header.writeUInt32BE(options.height ?? 1, 4);
  header[8] = options.depth ?? 8;
  header[9] = options.color ?? 6;
  header[10] = options.compression ?? 0;
  header[11] = options.filterMethod ?? 0;
  header[12] = options.interlace ?? 0;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header),
    ...(options.palette ? [chunk("PLTE", options.palette)] : []),
    ...(options.transparency ? [chunk("tRNS", options.transparency)] : []),
    chunk("IDAT", deflateSync(options.pixels)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("avatar PNG rejects invalid IHDR formats even with valid CRC and zlib data", () => {
  for (const header of [
    { depth: 7 }, { color: 1 }, { color: 5 }, { color: 2, depth: 4 },
    { color: 3, depth: 16 }, { compression: 1 }, { filterMethod: 1 }, { interlace: 2 },
  ]) {
    assert.throws(() => validateAccountAvatarUpload(upload(pngWithRaster({ ...header, pixels: Buffer.alloc(5) }))), { statusCode: 400 });
  }
});

test("avatar PNG checks exact raster lengths and rejects invalid scanline filters", () => {
  for (const pixels of [Buffer.alloc(4), Buffer.alloc(6), Buffer.from([5, 0, 0, 0, 0]), Buffer.alloc(65536)]) {
    assert.throws(() => validateAccountAvatarUpload(upload(pngWithRaster({ pixels }))), { statusCode: 400 });
  }
  for (const filter of [0, 1, 2, 3, 4]) {
    assert.equal(validateAccountAvatarUpload(upload(pngWithRaster({ pixels: Buffer.from([filter, 0, 0, 0, 0]) }))).mimeType, "image/png");
  }
  assert.equal(validateAccountAvatarUpload(upload(pngWithRaster({ color: 0, depth: 1, pixels: Buffer.alloc(2) }))).mimeType, "image/png");
  assert.equal(validateAccountAvatarUpload(upload(pngWithRaster({ depth: 16, pixels: Buffer.alloc(9) }))).mimeType, "image/png");
});

test("avatar PNG accepts valid small and full Adam7 rasters and rejects incomplete passes", () => {
  // Independent 8x8 RGBA Adam7 sizes: 1x1,1x1,2x1,2x2,4x2,4x4,8x4.
  const passes = [[1, 1], [1, 1], [2, 1], [2, 2], [4, 2], [4, 4], [8, 4]];
  const raster = Buffer.concat(passes.map(([width, height]) => Buffer.alloc((1 + width * 4) * height)));
  assert.equal(raster.length, 271);
  assert.equal(validateAccountAvatarUpload(upload(pngWithRaster({ width: 8, height: 8, interlace: 1, pixels: raster }))).mimeType, "image/png");
  // A 1x1 interlaced image has only pass one; empty passes have no filter bytes.
  assert.equal(validateAccountAvatarUpload(upload(pngWithRaster({ interlace: 1, pixels: Buffer.alloc(5) }))).mimeType, "image/png");
  assert.throws(() => validateAccountAvatarUpload(upload(pngWithRaster({ width: 8, height: 8, interlace: 1, pixels: raster.subarray(0, -1) }))), { statusCode: 400 });
  const badFilter = Buffer.from(raster);
  badFilter[5] = 5;
  assert.throws(() => validateAccountAvatarUpload(upload(pngWithRaster({ width: 8, height: 8, interlace: 1, pixels: badFilter }))), { statusCode: 400 });
});

test("avatar indexed PNG requires a correctly sized palette", () => {
  const input = { color: 3, depth: 1, pixels: Buffer.alloc(2) };
  assert.equal(validateAccountAvatarUpload(upload(pngWithRaster({ ...input, palette: Buffer.from([0, 0, 0, 255, 255, 255]) }))).mimeType, "image/png");
  const transparent = validateAccountAvatarUpload(upload(pngWithRaster({ ...input, palette: Buffer.from([0, 0, 0, 255, 255, 255]), transparency: Buffer.from([0, 255]) })));
  assert.ok(transparent.buffer.includes(Buffer.from("tRNS")), "Indexed transparency must survive sanitization.");
  for (const palette of [undefined, Buffer.alloc(2), Buffer.alloc(9)]) {
    assert.throws(() => validateAccountAvatarUpload(upload(pngWithRaster({ ...input, ...(palette ? { palette } : {}) }))), { statusCode: 400 });
  }
});

// Offline Chromium canvas encodings of a synthetic 2x2 solid #2468ac square.
// ICC metadata is intentionally included to exercise the shared sanitizer.
const jpegBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AI4AzEX/2Q==";
const webpBase64 = "UklGRhoCAABXRUJQVlA4WAoAAAAgAAAAAQAAAQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggLAAAANABAJ0BKgIAAgABQCYloAJ0ugH4AAOwAP7v/cP/OJY6nd0H//MEr8g3KgAA";

// Offline Pillow encodings of the same synthetic square: genuine multi-scan
// progressive JPEG, lossless WebP alpha and lossy WebP with a raw ALPH plane.
const progressiveJpegBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUAQEAAAAAAAAAAAAAAAAAAAAF/9oADAMBAAIQAxAAAAGYFDf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEPP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==";
const losslessWebpBase64 = "UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAEAdQtJKUtYCBiOh/AAA=";
const alphaWebpBase64 = "UklGRlgAAABXRUJQVlA4WAoAAAAQAAAAAQAAAQAAQUxQSAUAAAAAgICAgABWUDggLAAAANABAJ0BKgIAAgABQCYloAJ0ugH4AAOwAP7v/cP/OJY6nd0H//MEr8g3KgAA";

const jpegUpload = (buffer: Buffer) => ({ fileName: "photo.jpg", mimeType: "image/jpeg", contentBase64: buffer.toString("base64") });
const webpUpload = (buffer: Buffer) => ({ fileName: "photo.webp", mimeType: "image/webp", contentBase64: buffer.toString("base64") });

function riffChunk(type: string, data: Buffer) {
  const result = Buffer.alloc(8 + data.length + data.length % 2);
  result.write(type, 0, "ascii");
  result.writeUInt32LE(data.length, 4);
  data.copy(result, 8);
  return result;
}

function webp(...chunks: Buffer[]) {
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(4 + chunks.reduce((size, item) => size + item.length, 0), 4);
  header.write("WEBP", 8, "ascii");
  return Buffer.concat([header, ...chunks]);
}

test("avatar JPEG rejects malformed SOF/SOS fields, including headers in later progressive scans", () => {
  const source = Buffer.from(jpegBase64, "base64");
  const sof = source.indexOf(Buffer.from([0xff, 0xc0]));
  const sos = source.indexOf(Buffer.from([0xff, 0xda]));
  assert.ok(sof > 0 && sos > sof);
  for (const [offset, value] of [
    [sof + 4, 7], [sof + 9, 0], [sof + 9, 2], [sof + 11, 0], [sof + 11, 0x51],
    [sof + 12, 4], [sof + 13, source[sof + 10]],
    [sos + 4, 0], [sos + 4, 2], [sos + 5, 99], [sos + 7, source[sos + 5]],
    [sos + 6, 0xf0], [sos + 11, 1], [sos + 12, 64], [sos + 13, 1],
  ]) {
    const damaged = Buffer.from(source);
    damaged[offset] = value;
    assert.throws(() => validateAccountAvatarUpload(jpegUpload(damaged)), { statusCode: 400 });
  }
  const progressive = Buffer.from(progressiveJpegBase64, "base64");
  assert.equal(validateAccountAvatarUpload(jpegUpload(progressive)).mimeType, "image/jpeg");
  const lastScan = progressive.lastIndexOf(Buffer.from([0xff, 0xda]));
  assert.ok(lastScan > progressive.indexOf(Buffer.from([0xff, 0xda])));
  progressive[lastScan + 9] = 0xff;
  assert.throws(() => validateAccountAvatarUpload(jpegUpload(progressive)), { statusCode: 400 });
  const noScanData = Buffer.concat([source.subarray(0, sos + 2 + source.readUInt16BE(sos + 2)), Buffer.from([0xff, 0xd9])]);
  assert.throws(() => validateAccountAvatarUpload(jpegUpload(noScanData)), { statusCode: 400 });
});

test("avatar WebP validates inner VP8 headers even when VP8X contains plausible dimensions", () => {
  const source = Buffer.from(webpBase64, "base64");
  const frame = source.indexOf(Buffer.from("VP8 ")) + 8;
  assert.ok(frame > 20);
  for (const [offset, value] of [
    [20, 0x80], [21, 1], [frame, source[frame] | 1], [frame, source[frame] | 8],
    [frame, source[frame] & ~16], [frame + 2, 255], [frame + 3, 0], [frame + 6, 3], [frame + 7, 255],
  ]) {
    const damaged = Buffer.from(source);
    damaged[offset] = value;
    assert.throws(() => validateAccountAvatarUpload(webpUpload(damaged)), { statusCode: 400 });
  }
  const shortFrame = riffChunk("VP8 ", source.subarray(frame, frame + 10));
  assert.throws(() => validateAccountAvatarUpload(webpUpload(webp(riffChunk("VP8X", source.subarray(20, 30)), shortFrame))), { statusCode: 400 });
  assert.throws(() => validateAccountAvatarUpload(webpUpload(webp(riffChunk("VP8X", Buffer.alloc(10))))), { statusCode: 400 });
});

test("avatar WebP preserves valid lossless and lossy transparency and rejects malformed inner headers", () => {
  for (const encoded of [losslessWebpBase64, alphaWebpBase64]) {
    assert.equal(validateAccountAvatarUpload(webpUpload(Buffer.from(encoded, "base64"))).mimeType, "image/webp");
  }
  const lossless = Buffer.from(losslessWebpBase64, "base64");
  for (const [offset, value] of [[20, 0], [24, lossless[24] | 0x20]]) {
    const damaged = Buffer.from(lossless);
    damaged[offset] = value;
    assert.throws(() => validateAccountAvatarUpload(webpUpload(damaged)), { statusCode: 400 });
  }
  const alpha = Buffer.from(alphaWebpBase64, "base64");
  const alphaHeader = alpha.indexOf(Buffer.from("ALPH")) + 8;
  for (const value of [2, 0x20, 0x40]) {
    const damaged = Buffer.from(alpha);
    damaged[alphaHeader] = value;
    assert.throws(() => validateAccountAvatarUpload(webpUpload(damaged)), { statusCode: 400 });
  }
});

test("avatar animated WebP validates actual frame payload and canvas bounds", () => {
  const source = Buffer.from(webpBase64, "base64");
  const frameOffset = source.indexOf(Buffer.from("VP8 "));
  const frame = source.subarray(frameOffset, frameOffset + 8 + source.readUInt32LE(frameOffset + 4));
  const canvas = Buffer.from(source.subarray(20, 30));
  canvas[0] = 2;
  const frameHeader = Buffer.alloc(16);
  frameHeader.writeUIntLE(1, 6, 3);
  frameHeader.writeUIntLE(1, 9, 3);
  frameHeader.writeUIntLE(100, 12, 3);
  const animated = (header: Buffer, content = frame) => webp(riffChunk("VP8X", canvas), riffChunk("ANIM", Buffer.alloc(6)), riffChunk("ANMF", Buffer.concat([header, content])));
  assert.equal(validateAccountAvatarUpload(webpUpload(animated(frameHeader))).mimeType, "image/webp");
  for (const [offset, value] of [[0, 1], [6, 2], [9, 2], [15, 4]]) {
    const damaged = Buffer.from(frameHeader);
    damaged[offset] = value;
    assert.throws(() => validateAccountAvatarUpload(webpUpload(animated(damaged))), { statusCode: 400 });
  }
  assert.throws(() => validateAccountAvatarUpload(webpUpload(animated(frameHeader, Buffer.alloc(0)))), { statusCode: 400 });
  const badFrame = Buffer.from(frame);
  badFrame[11] = 0;
  assert.throws(() => validateAccountAvatarUpload(webpUpload(animated(frameHeader, badFrame))), { statusCode: 400 });
});

test("avatar validation accepts genuine JPEG with both extensions and strips ICC metadata", () => {
  const source = Buffer.from(jpegBase64, "base64");
  for (const fileName of ["portrait.jpg", "portrait.JPEG"]) {
    const result = validateAccountAvatarUpload({ fileName, mimeType: "image/jpeg", contentBase64: jpegBase64 });
    assert.equal(result.mimeType, "image/jpeg");
    assert.ok(result.buffer.length < source.length);
    assert.equal(result.buffer.includes(Buffer.from("ICC_PROFILE")), false);
    assert.ok(result.buffer.includes(Buffer.from([0xff, 0xda])), "JPEG scan data must survive metadata removal.");
    const repeated = validateAccountAvatarUpload({ fileName, mimeType: "image/jpeg", contentBase64: result.buffer.toString("base64") });
    assert.deepEqual(repeated.buffer, result.buffer);
  }
  assert.throws(() => validateAccountAvatarUpload({ fileName: "portrait.jpg", mimeType: "image/jpeg", contentBase64: source.subarray(0, source.length - 2).toString("base64") }), { statusCode: 400 });
  assert.throws(() => validateAccountAvatarUpload({ fileName: "portrait.jpg", mimeType: "image/webp", contentBase64: jpegBase64 }), { statusCode: 400 });
});

test("avatar validation accepts genuine extended WebP with VP8 payload and strips ICC metadata", () => {
  const source = Buffer.from(webpBase64, "base64");
  const result = validateAccountAvatarUpload({ fileName: "portrait.webp", mimeType: "image/webp", contentBase64: webpBase64 });
  assert.equal(result.mimeType, "image/webp");
  assert.ok(result.buffer.length < source.length);
  assert.equal(result.buffer.includes(Buffer.from("ICCP")), false);
  assert.ok(result.buffer.includes(Buffer.from("VP8 ")), "WebP image payload must survive metadata removal.");
  assert.equal(result.buffer.readUInt32LE(4), result.buffer.length - 8, "RIFF size must match the sanitized file.");
  assert.deepEqual(validateAccountAvatarUpload({ fileName: "portrait.webp", mimeType: "image/webp", contentBase64: result.buffer.toString("base64") }).buffer, result.buffer);
  assert.throws(() => validateAccountAvatarUpload({ fileName: "portrait.webp", mimeType: "image/webp", contentBase64: source.subarray(0, source.length - 1).toString("base64") }), { statusCode: 400 });
  assert.throws(() => validateAccountAvatarUpload({ fileName: "portrait.jpeg", mimeType: "image/webp", contentBase64: webpBase64 }), { statusCode: 400 });
});

test("avatar validation reuses image sanitization and removes private metadata", () => {
  const source = png();
  const result = validateAccountAvatarUpload(upload(source));
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.buffer.includes(Buffer.from("not-retained")), false);
  assert.ok(result.buffer.length < source.length);
});

test("avatar validation rejects unexpected identity, privilege and storage fields", () => {
  for (const key of ["userId", "id", "username", "newUsername", "email", "role", "permissions", "status", "isBanned", "path"]) {
    assert.throws(() => validateAccountAvatarUpload({ ...upload(), [key]: "other-user" }), { statusCode: 400 });
  }
});

test("avatar validation rejects unsafe names, forged MIME and extensions", () => {
  for (const fileName of ["../photo.png", "x\\photo.png", "/photo.png", "x:photo.png", "x\0.png", ".photo.png", "photo.exe", "photo.svg", "photo.png "]) {
    assert.throws(() => validateAccountAvatarUpload({ ...upload(), fileName }), { statusCode: 400 });
  }
  for (const mimeType of ["text/html", "image/svg+xml", "image/jpeg", "image/webp"]) {
    assert.throws(() => validateAccountAvatarUpload({ ...upload(), mimeType }), { statusCode: 400 });
  }
});

test("avatar validation rejects invalid base64, non-images, oversized and malformed image data", () => {
  for (const contentBase64 of ["!!!!", "AA=A", "data:image/png;base64,aaaa", "<script>x</script>", Buffer.alloc(ACCOUNT_AVATAR_MAX_BYTES).toString("base64"), Buffer.alloc(ACCOUNT_AVATAR_MAX_BYTES + 1).toString("base64")]) {
    assert.throws(() => validateAccountAvatarUpload({ ...upload(), contentBase64 }), { statusCode: 400 });
  }
  const corrupted = png();
  corrupted[corrupted.length - 5] ^= 1;
  for (const buffer of [Buffer.from("<svg onload='alert(1)'/>"), Buffer.from("%PDF-1.7\n%%EOF"), png().subarray(0, 30), Buffer.concat([png(), Buffer.from("script")]), corrupted, png(2049, 1)]) {
    assert.throws(() => validateAccountAvatarUpload(upload(buffer)), { statusCode: 400 });
  }
});
