import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function readRepositoryFile(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("production build emits and requires the isolated Excel parser worker", async () => {
  const [buildScript, prestartGuard] = await Promise.all([
    readRepositoryFile("scripts/build-server.mjs"),
    readRepositoryFile("scripts/ensure-build.mjs"),
  ]);

  for (const source of [buildScript, prestartGuard]) {
    assert.match(
      source,
      /dist-local\/server\/import-upload-excel-worker\.js/,
    );
  }
  assert.match(
    buildScript,
    /server\/services\/import-upload-excel-worker\.ts/,
  );
});
