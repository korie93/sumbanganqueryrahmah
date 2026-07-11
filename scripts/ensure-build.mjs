import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const buildArtifacts = [
  "dist-local/server/cluster-local.js",
  "dist-local/server/import-upload-excel-worker.js",
];
const missingBuildArtifacts = buildArtifacts.filter((artifact) => !existsSync(artifact));

if (missingBuildArtifacts.length === 0) {
  process.exit(0);
}

console.log(`Missing ${missingBuildArtifacts.join(", ")}. Running npm run build...`);

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", "build"], {
  stdio: "inherit",
});

if (result.error) {
  console.error("Failed to start build:", result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
