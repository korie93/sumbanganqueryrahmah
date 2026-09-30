import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

const CLIENT_INDEX_HTML_PATH = "client/index.html";
const BOOT_SHELL_CSS_PUBLIC_PATH = "/boot-shell.css";
const BOOT_SHELL_JS_PUBLIC_PATH = "/boot-shell.js";
const BOOT_SHELL_CSS_FILE_PATH = "client/public/boot-shell.css";
const BOOT_SHELL_JS_FILE_PATH = "client/public/boot-shell.js";

const STYLE_TAG_PATTERN = /<style\b[^>]*>/gi;
const INLINE_STYLE_ATTRIBUTE_PATTERN = /\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi;
const SCRIPT_TAG_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

// JSON-LD is an inert data block, not executable bootstrap code. Do not allow
// event handlers, arbitrary types, invalid JSON, or a script-closing injection.
export function isInertApplicationSchema(attributes, contents) {
  if (!/^\s+id="sqr-application-schema"\s+type="application\/ld\+json"\s*$/.test(attributes)
    || /[<>]/.test(contents)) return false;
  try {
    const value = JSON.parse(contents);
    return value?.["@context"] === "https://schema.org" && value?.["@type"] === "SoftwareApplication"
      && typeof value.name === "string" && value.url === "https://sqr-system.com/";
  } catch { return false; }
}

export function collectClientEntryShellContractMatches(params = {}) {
  const repoRoot = params.repoRoot || process.cwd();
  const indexPath = path.join(repoRoot, CLIENT_INDEX_HTML_PATH);
  const bootShellCssPath = path.join(repoRoot, BOOT_SHELL_CSS_FILE_PATH);
  const bootShellJsPath = path.join(repoRoot, BOOT_SHELL_JS_FILE_PATH);
  const html = readFileSync(indexPath, "utf8");
  const matches = [];

  for (const match of html.matchAll(STYLE_TAG_PATTERN)) {
    matches.push({
      filePath: CLIENT_INDEX_HTML_PATH,
      label: "client entry shell must not use inline <style> tags",
      snippet: match[0],
    });
  }

  for (const match of html.matchAll(INLINE_STYLE_ATTRIBUTE_PATTERN)) {
    matches.push({
      filePath: CLIENT_INDEX_HTML_PATH,
      label: "client entry shell must not use inline style attributes",
      snippet: match[0].trim(),
    });
  }

  for (const match of html.matchAll(SCRIPT_TAG_PATTERN)) {
    const attributes = match[1] || "";
    const contents = match[2] || "";
    const hasSrc = /\bsrc\s*=/i.test(attributes);
    if (hasSrc || isInertApplicationSchema(attributes, contents)) {
      continue;
    }

    const condensed = contents.replace(/\s+/g, " ").trim();
    matches.push({
      filePath: CLIENT_INDEX_HTML_PATH,
      label: "client entry shell must not use inline <script> blocks",
      snippet: condensed ? `<script${attributes}>${condensed}</script>` : `<script${attributes}></script>`,
    });
  }

  const bootShellMarkupMatch = html.match(/<[^>]*\bid\s*=\s*["']boot-shell["'][^>]*>/i);
  const hasBootShellMarkup = Boolean(bootShellMarkupMatch);
  const bootShellMarkup = bootShellMarkupMatch?.[0] || "";
  const hasAccessibleBootShellLiveRegion = (
    /\brole\s*=\s*["']status["']/i.test(bootShellMarkup)
    && /\baria-live\s*=\s*["']polite["']/i.test(bootShellMarkup)
    && /\baria-atomic\s*=\s*["']true["']/i.test(bootShellMarkup)
  );
  const hasBootShellCssLink = new RegExp(`<link\\b[^>]*href=["']${BOOT_SHELL_CSS_PUBLIC_PATH}["'][^>]*>`, "i").test(html);
  const bootShellJsScriptMatch = html.match(
    new RegExp(`<script\\b([^>]*)\\bsrc=["']${BOOT_SHELL_JS_PUBLIC_PATH}["']([^>]*)><\\/script>`, "i"),
  );
  const hasBootShellJsScript = Boolean(bootShellJsScriptMatch);
  const bootShellJsScriptAttributes = [
    bootShellJsScriptMatch?.[1] || "",
    bootShellJsScriptMatch?.[2] || "",
  ].join(" ");
  const hasAsyncBootShellScript = /\basync\b/i.test(bootShellJsScriptAttributes);
  const rootMarkupMatch = html.match(/<[^>]*\bid\s*=\s*["']root["'][^>]*>/i);
  const headEnd = html.search(/<\/head\s*>/i);
  const hasBootScriptAfterRoot = Boolean(rootMarkupMatch
    && headEnd >= 0
    && bootShellJsScriptMatch
    && bootShellJsScriptMatch.index > headEnd
    && bootShellJsScriptMatch.index > rootMarkupMatch.index);

  if (hasBootShellMarkup && !hasBootShellCssLink) {
    matches.push({
      filePath: CLIENT_INDEX_HTML_PATH,
      label: "boot shell markup must load the external boot shell stylesheet",
      snippet: BOOT_SHELL_CSS_PUBLIC_PATH,
    });
  }

  if (hasBootShellMarkup && !hasBootShellJsScript) {
    matches.push({
      filePath: CLIENT_INDEX_HTML_PATH,
      label: "boot shell markup must load the external boot shell script",
      snippet: BOOT_SHELL_JS_PUBLIC_PATH,
    });
  }

  if (hasBootShellJsScript && !hasAsyncBootShellScript) {
    matches.push({
      filePath: CLIENT_INDEX_HTML_PATH,
      label: "boot shell script must use async so resource discovery does not wait for stylesheets",
      snippet: bootShellJsScriptMatch?.[0] || BOOT_SHELL_JS_PUBLIC_PATH,
    });
  }

  if (hasBootShellJsScript && !hasBootScriptAfterRoot) {
    matches.push({
      filePath: CLIENT_INDEX_HTML_PATH,
      label: "async boot shell script must follow the app root and all head resource metadata",
      snippet: bootShellJsScriptMatch?.[0] || BOOT_SHELL_JS_PUBLIC_PATH,
    });
  }

  if (hasBootShellMarkup && !hasAccessibleBootShellLiveRegion) {
    matches.push({
      filePath: CLIENT_INDEX_HTML_PATH,
      label: "boot shell markup must expose a polite status live region",
      snippet: bootShellMarkup || "boot-shell",
    });
  }

  if (hasBootShellCssLink && !existsSync(bootShellCssPath)) {
    matches.push({
      filePath: BOOT_SHELL_CSS_FILE_PATH,
      label: "boot shell stylesheet reference is missing its public asset",
      snippet: BOOT_SHELL_CSS_PUBLIC_PATH,
    });
  }

  if (hasBootShellJsScript && !existsSync(bootShellJsPath)) {
    matches.push({
      filePath: BOOT_SHELL_JS_FILE_PATH,
      label: "boot shell script reference is missing its public asset",
      snippet: BOOT_SHELL_JS_PUBLIC_PATH,
    });
  }

  return {
    matches,
    summary: {
      indexPath: CLIENT_INDEX_HTML_PATH,
      hasBootShellMarkup,
      bootShellCssFilePath: BOOT_SHELL_CSS_FILE_PATH,
      bootShellJsFilePath: BOOT_SHELL_JS_FILE_PATH,
    },
  };
}

export function formatClientEntryShellContractReport(result) {
  const matches = result?.matches || [];
  const summary = result?.summary || {};
  const inspected = `Client entry shell contract inspected ${summary.indexPath || CLIENT_INDEX_HTML_PATH}.`;

  if (matches.length === 0) {
    return [
      inspected,
      "Client entry shell remains free of inline style/script blocks with executable code; only validated inert application JSON-LD is allowed, and keeps boot shell assets externalized.",
    ].join("\n");
  }

  return [
    inspected,
    "Client entry shell contract failures:",
    ...matches.map((match) => `- ${match.filePath}: ${match.label} (${match.snippet})`),
  ].join("\n");
}
