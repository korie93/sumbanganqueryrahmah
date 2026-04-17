import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const distDir = path.resolve("dist-local", "public");
const assetsDir = path.join(distDir, "assets");
const indexHtmlPath = path.join(distDir, "index.html");

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function classifyAsset(name) {
  if (/^index-.*\.js$/i.test(name)) return "entry-js";
  if (/^index-.*\.css$/i.test(name)) return "entry-css";
  if (/^framework-.*\.js$/i.test(name)) return "framework";
  if (/^query-.*\.js$/i.test(name)) return "query";
  if (/^charts-.*\.js$/i.test(name)) return "charts";
  if (/^excel-.*\.js$/i.test(name)) return "excel";
  if (/^pdf-.*\.js$/i.test(name)) return "pdf";
  if (/^capture-.*\.js$/i.test(name)) return "capture";
  if (/\.css$/i.test(name)) return "css";
  if (/\.js$/i.test(name)) return "js";
  return "other";
}

function extractEntryAssetName(html, assetType) {
  if (assetType === "script") {
    return html.match(/<script[^>]+type="module"[^>]+src="\/assets\/([^"]+)"/i)?.[1] ?? null;
  }

  if (assetType === "stylesheet") {
    return html.match(/<link[^>]+rel="stylesheet"[^>]+href="\/assets\/([^"]+)"/i)?.[1] ?? null;
  }

  return null;
}

async function readBuildArtifacts() {
  const [entries, html] = await Promise.all([
    fs.readdir(assetsDir, { withFileTypes: true }),
    fs.readFile(indexHtmlPath, "utf8"),
  ]);

  const assetFiles = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const fullPath = path.join(assetsDir, entry.name);
        const stat = await fs.stat(fullPath);
        return {
          bytes: stat.size,
          name: entry.name,
          type: classifyAsset(entry.name),
        };
      }),
  );

  return {
    assets: assetFiles.sort((left, right) => right.bytes - left.bytes),
    entryScript: extractEntryAssetName(html, "script"),
    entryStylesheet: extractEntryAssetName(html, "stylesheet"),
  };
}

async function run() {
  let buildArtifacts;
  try {
    buildArtifacts = await readBuildArtifacts();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Bundle analysis requires an existing client build under ${distDir}. Run "npm run build" first. ${message}`,
    );
  }

  console.log("Client bundle composition report");
  console.log(`Entry script: ${buildArtifacts.entryScript ?? "(missing)"}`);
  console.log(`Entry stylesheet: ${buildArtifacts.entryStylesheet ?? "(missing)"}`);
  console.log("");
  console.log("Largest generated assets:");

  for (const asset of buildArtifacts.assets) {
    console.log(
      `${asset.type.padEnd(12)} ${formatKB(asset.bytes).padStart(10)}  ${asset.name}`,
    );
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
