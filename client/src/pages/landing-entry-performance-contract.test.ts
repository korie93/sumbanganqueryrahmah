import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

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
    /Operational data, structured for faster decisions\./,
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

function runBootShell(pathname: string) {
  const elements = new Map<string, { textContent: string }>([
    ["boot-shell-eyebrow", { textContent: "" }],
    ["boot-shell-title", { textContent: "" }],
    ["boot-shell-copy", { textContent: "" }],
  ]);
  const attributes = new Map<string, string>();
  const documentElement = {
    lang: "en",
    setAttribute(name: string, value: string) { attributes.set(name, value); },
  };
  runInNewContext(bootShellScript, {
    window: { location: { pathname } },
    document: {
      documentElement,
      readyState: "complete",
      getElementById(id: string) { return elements.get(id); },
    },
  });
  return { documentElement, attributes, elements };
}

test("landing boot uses English while direct login retains its original Malay copy", () => {
  const landing = runBootShell("/");
  assert.equal(landing.documentElement.lang, "en");
  assert.equal(landing.attributes.get("data-boot-shell"), "landing");
  assert.equal(landing.elements.get("boot-shell-eyebrow")?.textContent, "SQR Operations Platform");
  assert.equal(landing.elements.get("boot-shell-title")?.textContent, "Operational data, structured for faster decisions.");

  const login = runBootShell("/login");
  assert.equal(login.documentElement.lang, "ms");
  assert.equal(login.attributes.get("data-boot-shell"), "public-auth");
  assert.equal(login.elements.get("boot-shell-title")?.textContent, "Log In SQR System");
  assert.equal(login.elements.get("boot-shell-copy")?.textContent, "Platform operasi dalaman Sumbangan Query Rahmah sedang disediakan.");
});

test("direct internal routes retain Malay and do not select the public landing boot", () => {
  const internal = runBootShell("/general-search");
  assert.equal(internal.documentElement.lang, "ms");
  assert.equal(internal.attributes.has("data-boot-shell"), false);
});
