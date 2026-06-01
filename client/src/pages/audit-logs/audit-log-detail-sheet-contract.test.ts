import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readAuditLogSource(fileName: string): string {
  return readFileSync(path.resolve(__dirname, fileName), "utf8");
}

test("audit log detail sheet reports clipboard copy failures through client diagnostics", () => {
  const source = readAuditLogSource("AuditLogDetailSheet.tsx");

  assert.match(source, /import \{ logClientError \} from "@\/lib\/client-logger"/);
  assert.match(source, /catch \(error: unknown\)/);
  assert.match(source, /logClientError\("\[AuditLogDetailSheet\] Failed to copy request ID", error\)/);
  assert.match(source, /title: "Failed to copy"/);
});
