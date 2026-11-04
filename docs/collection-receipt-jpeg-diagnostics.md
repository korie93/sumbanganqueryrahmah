# JPEG receipt EOI diagnostics

The message `Receipt JPEG contains trailing data after the EOI marker.` means the structural parser found the JPEG end marker before the end of the uploaded file. The associated API code is `COLLECTION_RECEIPT_JPEG_TRAILING_DATA`. It does not identify the suffix or establish that the suffix is safe.

The read-only diagnostic command produces structural counts and fixed classifications without sharing the image. It uses the same marker walk as upload validation, including progressive scans, marker fill, byte stuffing and length-delimited metadata. The shared JPEG validator still requires EOI at EOF and rejects every suffix. Receipt ingestion has the exact-match compatibility normalization described below, before strict validation; the diagnostic itself never normalizes files.

## Local use

Use Linux/WSL with a trusted, stable parent directory and an explicit file owned by the operator. This command does not load application configuration, connect to a database, or invoke the upload/scanning/persistence flow.

First check that the tool is installed in the checkout/release where the command will run. New files in a local working copy do not install the command on a server; the matching code must be built and deployed there first. From the application directory, check the package script without selecting a receipt:

```bash
npm pkg get scripts.collection:diagnose-receipt-jpeg
```

An empty object (`{}`) means the script is absent. A package-file error means the command is being run outside the application directory. For a built release, check its standalone entry without selecting a file:

```bash
node dist-local/scripts/diagnose-collection-receipt-jpeg.js --help
```

Complete these checks before using `npm --silent run`: silent mode also hides npm's missing-script and missing-package errors, leaving no text even though npm exits unsuccessfully. It does not hide output from a diagnostic process that actually starts. Keep readiness checks free of receipt filenames/paths; retain `--silent` when passing an actual receipt to the development command below.

With the development toolchain already installed:

```bash
npm --silent run collection:diagnose-receipt-jpeg -- --file /path/to/synthetic-test.jpg
```

After a normal production build, the standalone bundled entry point is:

```bash
node dist-local/scripts/diagnose-collection-receipt-jpeg.js --file /path/to/synthetic-test.jpg
```

Use `--silent` with npm: npm's ordinary lifecycle banner echoes the command and selected path. Direct invocation of the bundled Node entry prints only the report. Choose an original file without resaving/cropping it after reproducing the issue. No image needs to be sent elsewhere. Share only the JSON report when investigating a failure.

Example report:

```json
{
  "fileBytes": 42819,
  "eoiEndOffset": 42803,
  "trailingBytes": 16,
  "trailingClassification": "nul-only",
  "reasonCode": "jpeg-trailing-data"
}
```

`eoiEndOffset` is zero-based and exclusive: it includes the recognized two-byte `FF D9` marker. `trailingBytes` is the number of remaining bytes. The command does not print paths, filenames, hashes, EXIF values, raw suffixes, image contents, or native error details.

| Classification | Observation |
| --- | --- |
| `none` | No bytes follow the recognized EOI. |
| `nul-only` | Every remaining byte is zero. |
| `ascii-whitespace-only` | Every remaining byte is ASCII 0x09–0x0D or 0x20. |
| `nul-and-ascii-whitespace` | Only those whitespace bytes and zero bytes remain. |
| `jpeg-signature-prefix` | The suffix begins with `FF D8`; its contents have not been validated as another image. |
| `other` | The suffix does not match the fixed categories above. |
| `unavailable` | Structural parsing failed before a recognized EOI; offset/count are null. |

These labels are observations, not safety verdicts. A null reason means only that the existing JPEG structural validator accepts the bytes; it does not establish raster decoding, dimensions, MIME agreement, or malware safety. All ordinary upload checks remain necessary.

Exit code 0 means a diagnostic report was produced, including reports describing rejected image structure. Exit code 1 means usage or file reading failed; only a fixed error is written to stderr. `--help` prints usage.

## File-reading limits

The command opens one regular, singly linked file read-only with final-component no-follow and nonblocking flags. It reads at most 5 MiB in bounded chunks, probes for growth, checks descriptor identity/size/timestamps after reading, and closes the descriptor. Empty, oversized, linked, special and unreadable files fail closed, as do observed file changes. Platforms without the required flags, including typical Windows Node builds, must use Linux/WSL.

`O_NOFOLLOW` protects the final component only. The operator must supply a trusted, stable parent directory; the command does not promise race-safe traversal of mutable ancestors. It never rewrites, trims, repairs, scans, quarantines, deletes or stores the selected file.

## Confirmed cause and receipt-only compatibility

Two operator-supplied failing receipts reproduced `jpeg-trailing-data`. Both had a complete JPEG primary stream followed by the same fixed 20 bytes:

```text
FF E0 00 12 4A 46 58 58 00 57 41 00 00 00 00 00 00 00 00 00
```

This is an observed nonstandard APP0/JFXX-WA-shaped trailer, not an incomplete image. Its producer has not been established. The `JFXX` identifier alone does not make it a standard JFIF extension: [ITU T.871](https://www.itu.int/rec/dologin_pub.asp?id=T-REC-T.871-201105-I%21%21PDF-E&lang=e&type=items), section 10.2, defines extension codes `10`, `11` and `13`, whereas these bytes contain `57` after the identifier.

`sanitizeAndInspectCollectionReceiptBuffer()` removes exactly this entire constant suffix, only for JPEG receipt ingestion. The candidate must then pass the unchanged sanitizer, including structural EOI-at-EOF validation, metadata removal and image dimension/pixel limits. No EOI is invented, no arbitrary trailer is accepted, and no raster is recompressed. Altered, shortened, repeated or extended trailers and appended second images remain rejected. The removal is recorded as `jpeg-jfxx-wa-trailer`.

Both base64 and multipart ingestion scan, hash and persist the sanitized bytes, with their sanitized size. Raw upload limits and declared MIME/extension checks run before normalization. Scanner failure remains fail closed. Shared validation, avatar uploads, recovery of stored files, permissions and collection transactions are unchanged. Existing stored receipts are not rewritten.

Tests use genuine baseline/progressive encodings of synthetic 2x2 images and the fixed non-image constant; the supplied receipts are not repository fixtures. The diagnostic continues to report their original suffix as `other` / `jpeg-trailing-data`, even though receipt ingestion can safely remove this exact constant before validating the remaining JPEG.

Run the focused regressions with the existing toolchain:

```bash
node --import tsx --test --test-concurrency=1 \
  server/lib/tests/collection-receipt-jpeg-diagnostics.test.ts \
  server/lib/tests/collection-receipt-jpeg-diagnostic-file.test.ts \
  server/routes/tests/collection-receipt-jpeg-compatibility.test.ts \
  server/routes/tests/collection-receipt-jpeg-storage.test.ts
```

The diagnostic tests also participate in `npm run test:services`; the compatibility/storage tests participate in `npm run test:routes`. Tests use synthetic bytes and disposable directories only. No dependency was added.
