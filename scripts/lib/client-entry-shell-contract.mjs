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
    if (hasSrc) {
      continue;
    }

    const condensed = contents.replace(/\s+/g, " ").trim();
    matches.push({
      filePath: CLIENT_INDEX_HTML_PATH,
      label: "client entry shell must not use inline <script> blocks",
      snippet: condensed ? `<script${attributes}>${condensed}</script>` : `<script${attributes}></script>`,
    });
  }

  const hasBootShellMarkup = /\bid\s*=\s*["']boot-shell["']/i.test(html);
  const hasBootShellCssLink = new RegExp(`<link\\b[^>]*href=["']${BOOT_SHELL_CSS_PUBLIC_PATH}["'][^>]*>`, "i").test(html);
  const hasBootShellJsScript = new RegExp(`<script\\b[^>]*src=["']${BOOT_SHELL_JS_PUBLIC_PATH}["'][^>]*><\\/script>`, "i").test(html);

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
      "Client entry shell remains free of inline style/script blocks and keeps boot shell assets externalized.",
    ].join("\n");
  }

  return [
    inspected,
    "Client entry shell contract failures:",
    ...matches.map((match) => `- ${match.filePath}: ${match.label} (${match.snippet})`),
  ].join("\n");
}
