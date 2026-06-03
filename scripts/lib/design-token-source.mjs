import { readFileSync } from "node:fs";
import path from "node:path";

export const THEME_TOKEN_ENTRY_FILE_PATH = "client/src/styles/tokens/index.css";

export function readCssWithImports(filePath, seen = new Set()) {
  const absolutePath = path.resolve(filePath);
  if (seen.has(absolutePath)) {
    return "";
  }

  seen.add(absolutePath);
  const source = readFileSync(absolutePath, "utf8");
  const directory = path.dirname(absolutePath);

  return source.replace(
    /^@import\s+["']([^"']+)["'];\s*$/gm,
    (_statement, importPath) => readCssWithImports(path.resolve(directory, importPath), seen),
  );
}

export function readThemeTokenSource(repoRoot = process.cwd()) {
  return readCssWithImports(path.resolve(repoRoot, THEME_TOKEN_ENTRY_FILE_PATH));
}
