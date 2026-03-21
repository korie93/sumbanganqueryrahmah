import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const buildArtifact = "dist-local/server/cluster-local.js";

if (existsSync(buildArtifact)) {
  process.exit(0);
}

console.log(`Missing ${buildArtifact}. Running npm run build...`);

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", "build"], {
  stdio: "inherit",
});

if (result.error) {
  console.error("Failed to start build:", result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
