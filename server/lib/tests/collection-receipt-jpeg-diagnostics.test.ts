import assert from "node:assert/strict";
import test from "node:test";
import * as jpegSecurity from "../collection-receipt-jpeg-security-utils";
import { CollectionReceiptSecurityError } from "../collection-receipt-security-shared";

type Diagnostic = {
  fileBytes: number;
  eoiEndOffset: number | null;
  trailingBytes: number | null;
  trailingClassification: string;
  reasonCode: string | null;
};

function diagnose(buffer: Buffer): Diagnostic {
  const module = jpegSecurity as typeof jpegSecurity & {
    diagnoseJpegStructure?: (input: Buffer) => Diagnostic;
  };
  assert.equal(typeof module.diagnoseJpegStructure, "function", "JPEG structural diagnostics must be available");
  assert.ok(module.diagnoseJpegStructure);
  return module.diagnoseJpegStructure(buffer);
}

const structuralJpeg = Buffer.from("ffd8ffda000211ffd9", "hex");

// Genuine offline Pillow encoding of a synthetic 2x2 #2468ac square.
// Same progressive fixture used by account-avatar-image.test.ts, with no user data.
const progressiveJpegBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUAQEAAAAAAAAAAAAAAAAAAAAF/9oADAMBAAIQAxAAAAGYFDf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEPP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==";

test("JPEG diagnostic reports exact EOF without changing strict validation or input", () => {
  const before = Buffer.from(structuralJpeg);
  jpegSecurity.validateJpegStructure(structuralJpeg);
  assert.deepEqual(diagnose(structuralJpeg), {
    fileBytes: 9, eoiEndOffset: 9, trailingBytes: 0,
    trailingClassification: "none", reasonCode: null,
  });
  assert.deepEqual(structuralJpeg, before);
});

const suffixCases = [
  ["nul-only", Buffer.from([0, 0])],
  ["ascii-whitespace-only", Buffer.from([0x09, 0x0a, 0x0c, 0x0d, 0x20])],
  ["nul-and-ascii-whitespace", Buffer.from([0, 0x20, 0x0a])],
  ["jpeg-signature-prefix", structuralJpeg],
  ["other", Buffer.from("<script>private@example.test</script>")],
  ["other", Buffer.from([0xff])],
  ["ascii-whitespace-only", Buffer.from([0x0b])],
  ["other", Buffer.from([0xc2, 0xa0])],
] as const;

for (const [classification, suffix] of suffixCases) {
  test(`JPEG diagnostic classifies ${classification} (${suffix.length} bytes) while strict upload still rejects`, () => {
    const input = Buffer.concat([structuralJpeg, suffix]);
    const before = Buffer.from(input);
    assert.throws(() => jpegSecurity.validateJpegStructure(input), (error: unknown) =>
      error instanceof CollectionReceiptSecurityError && error.reasonCode === "jpeg-trailing-data" &&
      error.message === "Receipt JPEG contains trailing data after the EOI marker.");
    assert.deepEqual(diagnose(input), {
      fileBytes: input.length, eoiEndOffset: structuralJpeg.length,
      trailingBytes: suffix.length, trailingClassification: classification,
      reasonCode: "jpeg-trailing-data",
    });
    assert.deepEqual(input, before);
  });
}

const markerCases = [
  ["scan marker fill", "ffd8ffda000211ffffffd900", 11],
  ["outer marker fill", "ffd8ffffd900", 5],
  ["EOI bytes in length-delimited metadata", "ffd8ffe10004ffd9ffda000211ffd9aabb", 15],
  ["stuffed bytes and restart markers", "ffd8ffda000211ff00d922ffd033ffd900", 16],
] as const;

for (const [label, hex, end] of markerCases) {
  test(`JPEG diagnostic follows structured markers: ${label}`, () => {
    const input = Buffer.from(hex, "hex");
    const result = diagnose(input);
    assert.equal(result.eoiEndOffset, end);
    assert.equal(result.trailingBytes, input.length - end);
    assert.equal(result.reasonCode, "jpeg-trailing-data");
    assert.throws(() => jpegSecurity.validateJpegStructure(input), { reasonCode: "jpeg-trailing-data" });
  });
}

test("JPEG diagnostic handles genuine progressive scans and never reports the appended second image's EOI", () => {
  const image = Buffer.from(progressiveJpegBase64, "base64");
  jpegSecurity.validateJpegStructure(image);
  assert.equal(diagnose(image).eoiEndOffset, image.length);
  assert.equal(diagnose(image).reasonCode, null);
  const doubled = Buffer.concat([image, image]);
  assert.deepEqual(diagnose(doubled), {
    fileBytes: doubled.length, eoiEndOffset: image.length, trailingBytes: image.length,
    trailingClassification: "jpeg-signature-prefix", reasonCode: "jpeg-trailing-data",
  });
  assert.throws(() => jpegSecurity.validateJpegStructure(doubled), { reasonCode: "jpeg-trailing-data" });
});

const malformedCases = [
  ["invalid header", "0000ffd9", "jpeg-header-invalid"],
  ["missing terminal EOI", "ffd8ffda000211", "jpeg-eoi-missing"],
  ["partial terminal EOI", "ffd8ffda000211ff", "jpeg-eoi-missing"],
  ["invalid segment length", "ffd8ffe10001ffd9", "jpeg-segment-invalid"],
  ["segment overrun", "ffd8ffe10020ffd9", "jpeg-segment-invalid"],
  ["EOI inside metadata without real EOI", "ffd8ffe10004ffd9ffda000211", "jpeg-eoi-missing"],
] as const;

for (const [label, hex, reason] of malformedCases) {
  test(`JPEG diagnostic reports no invented EOI: ${label}`, () => {
    const input = Buffer.from(hex, "hex");
    assert.throws(() => jpegSecurity.validateJpegStructure(input), { reasonCode: reason });
    assert.deepEqual(diagnose(input), {
      fileBytes: input.length, eoiEndOffset: null, trailingBytes: null,
      trailingClassification: "unavailable", reasonCode: reason,
    });
  });
}
