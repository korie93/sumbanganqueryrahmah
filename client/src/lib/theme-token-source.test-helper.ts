import { readFileSync } from "node:fs";
import path from "node:path";

export const THEME_TOKEN_ENTRY_PATH = path.resolve(
  process.cwd(),
  "client/src/styles/tokens/index.css",
);

export function readCssWithImports(filePath: string, seen = new Set<string>()): string {
  const absolutePath = path.resolve(filePath);
  if (seen.has(absolutePath)) {
    return "";
  }

  seen.add(absolutePath);
  const source = readFileSync(absolutePath, "utf8");
  const directory = path.dirname(absolutePath);

  return source.replace(
    /^@import\s+["']([^"']+)["'];\s*$/gm,
    (_statement, importPath: string) => readCssWithImports(path.resolve(directory, importPath), seen),
  );
}

export function readThemeTokenSource(): string {
  return readCssWithImports(THEME_TOKEN_ENTRY_PATH);
}
