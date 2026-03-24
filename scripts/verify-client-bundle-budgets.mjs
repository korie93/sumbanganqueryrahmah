import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const assetsDir = path.resolve("dist-local", "public", "assets");

const rules = [
  { label: "main-js", prefix: "index-", extension: ".js", maxKB: 260, required: true },
  { label: "main-css", prefix: "index-", extension: ".css", maxKB: 140, required: true },
  { label: "charts", prefix: "charts-", extension: ".js", maxKB: 760, required: false },
  { label: "excel", prefix: "excel-", extension: ".js", maxKB: 525, required: false },
  { label: "pdf", prefix: "pdf-", extension: ".js", maxKB: 420, required: false },
  { label: "capture", prefix: "capture-", extension: ".js", maxKB: 225, required: false },
  { label: "settings", prefix: "Settings-", extension: ".js", maxKB: 180, required: false },
  { label: "collection-records", prefix: "CollectionRecordsPage-", extension: ".js", maxKB: 100, required: false },
];

function toKB(bytes) {
  return bytes / 1024;
}

function formatKB(bytes) {
  return `${toKB(bytes).toFixed(1)} KB`;
}

async function readAssets() {
  const entries = await fs.readdir(assetsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(assetsDir, entry.name),
    }));
}

async function resolveRuleResult(assetFiles, rule) {
  const candidates = assetFiles.filter(
    (asset) => asset.name.startsWith(rule.prefix) && asset.name.endsWith(rule.extension),
  );
  if (!candidates.length) {
    return {
      ...rule,
      matched: false,
      bytes: 0,
      name: null,
      overBudget: rule.required,
      reason: rule.required ? "missing required asset" : "not generated",
    };
  }

  const sizedCandidates = await Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      stat: await fs.stat(candidate.fullPath),
    })),
  );
  const match = sizedCandidates.sort((left, right) => right.stat.size - left.stat.size)[0];
  const overBudget = toKB(match.stat.size) > rule.maxKB;
  return {
    ...rule,
    matched: true,
    bytes: match.stat.size,
    name: match.name,
    overBudget,
    reason: overBudget ? `exceeds ${rule.maxKB} KB budget` : "ok",
  };
}

async function run() {
  let assetFiles;
  try {
    assetFiles = await readAssets();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Bundle budget check requires a built client. Missing assets directory: ${assetsDir}. ${message}`);
  }

  const results = [];
  for (const rule of rules) {
    results.push(await resolveRuleResult(assetFiles, rule));
  }

  console.log("Client bundle budget report");
  for (const result of results) {
    const assetLabel = result.name ?? "(not present)";
    const sizeLabel = result.matched ? formatKB(result.bytes) : "-";
    console.log(
      `${result.label.padEnd(20)} ${assetLabel.padEnd(40)} ${sizeLabel.padStart(10)} / ${String(result.maxKB).padStart(4)} KB  ${result.reason}`,
    );
  }

  const failures = results.filter((result) => result.overBudget);
  if (failures.length > 0) {
    const summary = failures
      .map((result) => `${result.label}: ${result.reason}`)
      .join("; ");
    throw new Error(`Client bundle budget check failed: ${summary}`);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
