import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const bootShellScript = readFileSync(
  fileURLToPath(new URL("../../public/boot-shell.js", import.meta.url)),
  "utf8",
);
const bootShellStyles = readFileSync(
  fileURLToPath(new URL("../../public/boot-shell.css", import.meta.url)),
  "utf8",
);

test("public landing route paints meaningful content before React bootstrap", () => {
  assert.match(bootShellScript, /"\/":\s*\{\s*mode:\s*"landing"/);
  assert.match(
    bootShellScript,
    /Platform kerja dalaman untuk carian, semakan, dan pengurusan rekod sumbangan\./,
  );
  assert.match(
    bootShellScript,
    /setAttribute\("data-boot-shell", shell\.mode\)/,
  );
  assert.match(
    bootShellStyles,
    /html\[data-boot-shell="landing"\] \.public-auth-boot-shell\s*\{/,
  );
  assert.match(
    bootShellStyles,
    /html\[data-boot-shell="landing"\] \.public-auth-boot-shell__fields\s*\{\s*display:\s*none;/,
  );
});
