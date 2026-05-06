import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory)
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry);
      const stats = statSync(entryPath);

      if (stats.isDirectory()) {
        return collectTsxFiles(entryPath);
      }

      return entryPath.endsWith(".tsx") ? [entryPath] : [];
    });
}

test("iframe previews keep explicit accessible titles", () => {
  const clientSrcDir = path.resolve(process.cwd(), "client", "src");
  const iframeTags = collectTsxFiles(clientSrcDir).flatMap((filePath) => {
    const source = readFileSync(filePath, "utf8");
    return Array.from(source.matchAll(/<iframe\b[^>]*>/g)).map((match) => ({
      filePath,
      tag: match[0],
    }));
  });

  assert.ok(iframeTags.length > 0);

  for (const { filePath, tag } of iframeTags) {
    assert.match(tag, /\btitle=/, `${path.relative(clientSrcDir, filePath)} has an iframe without title`);
  }
});
