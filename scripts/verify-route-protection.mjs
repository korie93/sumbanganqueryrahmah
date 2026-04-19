import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROUTE_METHOD_PATTERN = /(?:\bapp|\bcontext\.app)\.(get|post|put|patch|delete)\s*\(/g;
const PROTECTION_MARKERS = [
  "authenticateToken",
  "requireRole",
  "requireTabAccess",
  "requireMonitorAccess",
  "reportAccess",
  "superuserReportAccess",
  "adminSummaryAccess",
];
const AUDITED_ROUTE_PREFIXES = ["/api/", "/internal/", "/telemetry/"];
const PUBLIC_ROUTE_PATTERNS = [
  /^\/api\/login$/,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/verify-two-factor-login$/,
  /^\/api\/auth\/activate-account$/,
  /^\/api\/auth\/validate-activation-token$/,
  /^\/api\/auth\/request-password-reset$/,
  /^\/api\/auth\/validate-password-reset-token$/,
  /^\/api\/auth\/reset-password-with-token$/,
  /^\/api\/health$/,
  /^\/api\/health\/live$/,
  /^\/api\/health\/ready$/,
  /^\/api\/maintenance-status$/,
  /^\/telemetry\/web-vitals$/,
  /^\/telemetry\/client-errors$/,
];

function listRouteFiles(rootDir) {
  const results = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "tests") {
          continue;
        }
        stack.push(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
        continue;
      }

      results.push(entryPath);
    }
  }

  return results.sort((left, right) => left.localeCompare(right));
}

function findClosingParenthesis(sourceText, openingParenthesisIndex) {
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let escaping = false;

  for (let index = openingParenthesisIndex; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    const nextCharacter = sourceText[index + 1];

    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      if (character === "*" && nextCharacter === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (character === "\\") {
        escaping = true;
        continue;
      }

      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      lineComment = true;
      index += 1;
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      blockComment = true;
      index += 1;
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function readPathLiteral(callSource) {
  const pathMatch = callSource.match(/\(\s*(["'`])([^"'`]+)\1/s);
  return pathMatch ? pathMatch[2].trim() : null;
}

function isAuditedRoutePath(routePath) {
  return AUDITED_ROUTE_PREFIXES.some((prefix) => routePath.startsWith(prefix));
}

function isPublicAllowlistedPath(routePath) {
  return PUBLIC_ROUTE_PATTERNS.some((pattern) => pattern.test(routePath));
}

function classifyRouteEntry(entry) {
  if (!entry.path || !isAuditedRoutePath(entry.path)) {
    return {
      ...entry,
      status: "out-of-scope",
    };
  }

  if (PROTECTION_MARKERS.some((marker) => entry.callSource.includes(marker))) {
    return {
      ...entry,
      status: "protected",
    };
  }

  if (isPublicAllowlistedPath(entry.path)) {
    return {
      ...entry,
      status: "public",
    };
  }

  return {
    ...entry,
    status: "suspicious-unprotected",
  };
}

export function extractRouteProtectionEntries(sourceText, relativeFilePath) {
  const entries = [];
  const parseErrors = [];
  let match;

  while ((match = ROUTE_METHOD_PATTERN.exec(sourceText)) !== null) {
    const openingParenthesisIndex = ROUTE_METHOD_PATTERN.lastIndex - 1;
    const closingParenthesisIndex = findClosingParenthesis(sourceText, openingParenthesisIndex);
    if (closingParenthesisIndex === -1) {
      parseErrors.push({
        filePath: relativeFilePath,
        method: match[1].toUpperCase(),
        message: "Failed to match the route call closing parenthesis.",
      });
      continue;
    }

    const callSource = sourceText.slice(match.index, closingParenthesisIndex + 1);
    const routePath = readPathLiteral(callSource);
    entries.push(classifyRouteEntry({
      filePath: relativeFilePath,
      method: match[1].toUpperCase(),
      path: routePath,
      callSource,
    }));
  }

  return {
    entries,
    parseErrors,
  };
}

export function auditRouteProtection(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const routesRootDir = path.resolve(repoRoot, "server", "routes");
  const routeFiles = listRouteFiles(routesRootDir);
  const entries = [];
  const parseErrors = [];

  for (const routeFilePath of routeFiles) {
    const relativeFilePath = path.relative(repoRoot, routeFilePath).replace(/\\/g, "/");
    const sourceText = readFileSync(routeFilePath, "utf8");
    const fileResult = extractRouteProtectionEntries(sourceText, relativeFilePath);
    entries.push(...fileResult.entries);
    parseErrors.push(...fileResult.parseErrors);
  }

  const auditedEntries = entries.filter((entry) => entry.status !== "out-of-scope");
  const suspiciousEntries = auditedEntries.filter((entry) => entry.status === "suspicious-unprotected");
  return {
    entries,
    auditedEntries,
    suspiciousEntries,
    parseErrors,
  };
}

function formatEntry(entry) {
  return `${entry.method} ${entry.path} (${entry.filePath})`;
}

function main() {
  const audit = auditRouteProtection();
  const protectedCount = audit.auditedEntries.filter((entry) => entry.status === "protected").length;
  const publicCount = audit.auditedEntries.filter((entry) => entry.status === "public").length;

  console.log("Route protection audit summary");
  console.log(`Protected: ${protectedCount}`);
  console.log(`Public allowlisted: ${publicCount}`);
  console.log(`Suspicious unprotected: ${audit.suspiciousEntries.length}`);
  console.log(`Parse issues: ${audit.parseErrors.length}`);

  if (audit.suspiciousEntries.length > 0) {
    console.error("\nSuspicious audited routes without explicit protection markers:");
    for (const entry of audit.suspiciousEntries) {
      console.error(`- ${formatEntry(entry)}`);
    }
  }

  if (audit.parseErrors.length > 0) {
    console.error("\nRoute audit parse issues:");
    for (const parseError of audit.parseErrors) {
      console.error(`- ${parseError.method} (${parseError.filePath}): ${parseError.message}`);
    }
  }

  if (audit.suspiciousEntries.length > 0 || audit.parseErrors.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
