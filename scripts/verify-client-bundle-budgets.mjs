import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";

const assetsDir = path.resolve("dist-local", "public", "assets");
const indexHtmlPath = path.resolve("dist-local", "public", "index.html");

const rules = [
  { label: "main-js", prefix: "index-", extension: ".js", maxKB: 260, maxGzipKB: 20, required: true, entryAssetType: "script" },
  { label: "main-css", prefix: "index-", extension: ".css", maxKB: 140, maxGzipKB: 14, required: true, entryAssetType: "stylesheet" },
  { label: "authenticated-css", prefix: "AuthenticatedAppEntry-", extension: ".css", maxKB: 140, maxGzipKB: 24, required: false },
  { label: "app-shell-css", prefix: "AuthenticatedAppShell-", extension: ".css", maxKB: 20, maxGzipKB: 4, required: false },
  { label: "charts", prefix: "charts-", extension: ".js", maxKB: 760, maxGzipKB: 130, required: false },
  { label: "excel", prefix: "excel-", extension: ".js", maxKB: 525, maxGzipKB: 170, required: false },
  { label: "pdf", prefix: "pdf-", extension: ".js", maxKB: 420, maxGzipKB: 140, required: false },
  { label: "capture", prefix: "capture-", extension: ".js", maxKB: 225, maxGzipKB: 55, required: false },
  { label: "settings", prefix: "Settings-", extension: ".js", maxKB: 180, maxGzipKB: 20, required: false },
  { label: "collection-records", prefix: "CollectionRecordsPage-", extension: ".js", maxKB: 100, maxGzipKB: 18, required: false },
];

function toKB(bytes) {
  return bytes / 1024;
}

function formatKB(bytes) {
  return `${toKB(bytes).toFixed(1)} KB`;
}

function buildReportResult(result) {
  return {
    budget: {
      gzipKB: result.maxGzipKB ?? null,
      rawKB: result.maxKB,
    },
    gzipBytes: result.gzipBytes ?? 0,
    gzipKB: result.matched ? Number(toKB(result.gzipBytes).toFixed(1)) : null,
    label: result.label,
    matched: result.matched,
    name: result.name,
    overBudget: result.overBudget,
    rawBytes: result.bytes ?? 0,
    rawKB: result.matched ? Number(toKB(result.bytes).toFixed(1)) : null,
    reason: result.reason,
  };
}

async function writeBudgetReportIfRequested(results) {
  const reportPath = String(process.env.BUNDLE_BUDGET_REPORT_PATH || "").trim();
  if (!reportPath) {
    return;
  }

  const resolvedReportPath = path.resolve(reportPath);
  await fs.mkdir(path.dirname(resolvedReportPath), { recursive: true });
  await fs.writeFile(
    resolvedReportPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      results: results.map(buildReportResult),
    }, null, 2)}\n`,
    "utf8",
  );
}

async function readAssetSize(fullPath) {
  const bytes = await fs.readFile(fullPath);
  return {
    bytes: bytes.length,
    gzipBytes: zlib.gzipSync(bytes, { level: 9 }).length,
  };
}

function resolveBudgetState(rule, bytes, gzipBytes) {
  const overRawBudget = toKB(bytes) > rule.maxKB;
  const overGzipBudget =
    typeof rule.maxGzipKB === "number"
    && toKB(gzipBytes) > rule.maxGzipKB;
  const overBudget = overRawBudget || overGzipBudget;
  const reasons = [];

  if (overRawBudget) {
    reasons.push(`raw exceeds ${rule.maxKB} KB`);
  }

  if (overGzipBudget) {
    reasons.push(`gzip exceeds ${rule.maxGzipKB} KB`);
  }

  return {
    overBudget,
    reason: overBudget ? reasons.join("; ") : "ok",
  };
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

function extractAssetNameFromHtml(html, assetType) {
  if (assetType === "script") {
    const match = html.match(/<script[^>]+type="module"[^>]+src="\/assets\/([^"]+)"/i);
    return match?.[1] ?? null;
  }

  if (assetType === "stylesheet") {
    const match = html.match(/<link[^>]+rel="stylesheet"[^>]+href="\/assets\/([^"]+)"/i);
    return match?.[1] ?? null;
  }

  return null;
}

async function readEntryAssets() {
  const html = await fs.readFile(indexHtmlPath, "utf8");
  return {
    script: extractAssetNameFromHtml(html, "script"),
    stylesheet: extractAssetNameFromHtml(html, "stylesheet"),
  };
}

async function resolveRuleResult(assetFiles, entryAssets, rule) {
  if (rule.entryAssetType) {
    const entryAssetName = entryAssets[rule.entryAssetType];
    if (!entryAssetName) {
      return {
        ...rule,
        matched: false,
        bytes: 0,
        name: null,
        overBudget: rule.required,
        reason: rule.required ? `missing ${rule.entryAssetType} entry asset in index.html` : "not generated",
      };
    }

    const entryAsset = assetFiles.find((asset) => asset.name === entryAssetName);
    if (!entryAsset) {
      return {
        ...rule,
        matched: false,
        bytes: 0,
        name: entryAssetName,
        overBudget: rule.required,
        reason: rule.required ? "entry asset referenced by index.html is missing from assets directory" : "not generated",
      };
    }

    const { bytes, gzipBytes } = await readAssetSize(entryAsset.fullPath);
    const budgetState = resolveBudgetState(rule, bytes, gzipBytes);
    return {
      ...rule,
      matched: true,
      bytes,
      gzipBytes,
      name: entryAsset.name,
      ...budgetState,
    };
  }

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
      size: await readAssetSize(candidate.fullPath),
    })),
  );
  const match = sizedCandidates.sort((left, right) => right.size.bytes - left.size.bytes)[0];
  const budgetState = resolveBudgetState(rule, match.size.bytes, match.size.gzipBytes);
  return {
    ...rule,
    matched: true,
    bytes: match.size.bytes,
    gzipBytes: match.size.gzipBytes,
    name: match.name,
    ...budgetState,
  };
}

async function run() {
  let assetFiles;
  let entryAssets;
  try {
    assetFiles = await readAssets();
    entryAssets = await readEntryAssets();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Bundle budget check requires a built client. Missing build output under ${path.resolve("dist-local", "public")}. ${message}`,
    );
  }

  const results = [];
  for (const rule of rules) {
    results.push(await resolveRuleResult(assetFiles, entryAssets, rule));
  }

  console.log("Client bundle budget report");
  for (const result of results) {
    const assetLabel = result.name ?? "(not present)";
    const rawSizeLabel = result.matched ? formatKB(result.bytes) : "-";
    const gzipSizeLabel = result.matched ? formatKB(result.gzipBytes) : "-";
    const gzipBudgetLabel = typeof result.maxGzipKB === "number" ? `${result.maxGzipKB} KB` : "-";
    console.log(
      `${result.label.padEnd(20)} ${assetLabel.padEnd(40)} raw ${rawSizeLabel.padStart(10)} / ${String(result.maxKB).padStart(4)} KB  gzip ${gzipSizeLabel.padStart(10)} / ${gzipBudgetLabel.padStart(6)}  ${result.reason}`,
    );
  }

  const failures = results.filter((result) => result.overBudget);
  await writeBudgetReportIfRequested(results);
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
