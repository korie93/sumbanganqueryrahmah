import process from "node:process";
import { diagnoseCollectionReceiptJpegFile } from "./collection-receipt-jpeg-diagnostic-file";

function printUsage(): void {
  process.stdout.write([
    "Collection receipt JPEG structure diagnostic (read-only)",
    "",
    "Usage:",
    "  npm --silent run collection:diagnose-receipt-jpeg -- --file <path>",
    "  npm --silent run collection:diagnose-receipt-jpeg -- --help",
    "",
    "Requires Linux/WSL with no-follow and nonblocking file-open support.",
    "Use a trusted, stable input directory: ancestor traversal is not secured.",
    "Prints scalar JSON only; image rejection does not mean the diagnostic failed.",
    "No files are changed and no image data, filenames, paths or hashes are printed.",
    "",
  ].join("\n"));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    printUsage();
    return;
  }
  if (args.length !== 2 || args[0] !== "--file" || !args[1] || args[1].includes("\0")) {
    process.stderr.write(JSON.stringify({ error: "jpeg-diagnostic-usage-invalid" }) + "\n");
    process.exitCode = 1;
    return;
  }

  try {
    const report = await diagnoseCollectionReceiptJpegFile(args[1]);
    process.stdout.write(JSON.stringify(report) + "\n");
  } catch {
    process.stderr.write(JSON.stringify({ error: "jpeg-diagnostic-read-failed" }) + "\n");
    process.exitCode = 1;
  }
}

void main();
