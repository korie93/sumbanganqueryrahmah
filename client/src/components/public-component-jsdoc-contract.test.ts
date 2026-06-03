import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const CLIENT_SRC_ROOT = path.join(process.cwd(), "client", "src");
const COMPONENTS_ROOT = path.join(CLIENT_SRC_ROOT, "components");
const PUBLIC_COMPONENT_USAGE_THRESHOLD = 3;

type ExportedComponent = {
  readonly filePath: string;
  readonly name: string;
};

function walkSourceFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPascalComponentName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name) && name !== name.toUpperCase();
}

function extractComponentExports(filePath: string, source: string): ExportedComponent[] {
  const exports: ExportedComponent[] = [];
  const directExportPatterns = [
    /export\s+(?:default\s+)?function\s+([A-Z][A-Za-z0-9_]*)\b/g,
    /export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*[:=]/g,
    /export\s+class\s+([A-Z][A-Za-z0-9_]*)\b/g,
  ];

  for (const pattern of directExportPatterns) {
    for (const match of source.matchAll(pattern)) {
      const name = match[1];

      if (name && isPascalComponentName(name)) {
        exports.push({ filePath, name });
      }
    }
  }

  for (const match of source.matchAll(/export\s+\{\s*([^}]+)\s*\}/g)) {
    const exportList = match[1];
    if (!exportList) {
      continue;
    }

    for (const part of exportList.split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();

      if (name && isPascalComponentName(name)) {
        exports.push({ filePath, name });
      }
    }
  }

  return exports;
}

function getDeclarationIndex(source: string, name: string): number {
  const escapedName = escapeRegExp(name);
  const declarationPatterns = [
    new RegExp(`(^|\\n)(export\\s+(?:default\\s+)?function\\s+${escapedName}\\b)`),
    new RegExp(`(^|\\n)(export\\s+const\\s+${escapedName}\\b)`),
    new RegExp(`(^|\\n)(export\\s+class\\s+${escapedName}\\b)`),
    new RegExp(`(^|\\n)(function\\s+${escapedName}\\b)`),
    new RegExp(`(^|\\n)(const\\s+${escapedName}\\b)`),
    new RegExp(`(^|\\n)(class\\s+${escapedName}\\b)`),
  ];

  for (const pattern of declarationPatterns) {
    const match = source.match(pattern);

    if (match?.index !== undefined) {
      return match.index + (match[1] === "\n" ? 1 : 0);
    }
  }

  return -1;
}

function hasJSDocBeforeDeclaration(source: string, declarationIndex: number): boolean {
  if (declarationIndex < 0) {
    return false;
  }

  const textBeforeDeclaration = source.slice(0, declarationIndex).trimEnd();
  return /\/\*\*[\s\S]*?\*\/\s*$/.test(textBeforeDeclaration);
}

test("heavily reused public component exports include JSDoc at their declaration", () => {
  const componentFiles = walkSourceFiles(COMPONENTS_ROOT).filter((filePath) =>
    filePath.endsWith(".tsx"),
  );
  const clientSourceText = walkSourceFiles(CLIENT_SRC_ROOT)
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  const missingJSDoc: string[] = [];

  for (const filePath of componentFiles) {
    const source = fs.readFileSync(filePath, "utf8");
    const exports = extractComponentExports(filePath, source);
    const uniqueExports = new Map(exports.map((entry) => [entry.name, entry]));

    for (const { name } of uniqueExports.values()) {
      const usageCount =
        (clientSourceText.match(new RegExp(`\\b${escapeRegExp(name)}\\b`, "g")) ?? []).length -
        1;

      if (usageCount < PUBLIC_COMPONENT_USAGE_THRESHOLD) {
        continue;
      }

      const declarationIndex = getDeclarationIndex(source, name);

      if (declarationIndex < 0) {
        continue;
      }

      if (!hasJSDocBeforeDeclaration(source, declarationIndex)) {
        const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
        missingJSDoc.push(`${relativePath}:${name}`);
      }
    }
  }

  assert.deepEqual(missingJSDoc, []);
});
