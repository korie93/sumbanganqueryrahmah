import process from "node:process";
import { spawn } from "node:child_process";

const npmCliPath = String(process.env.npm_execpath || "").trim();
const command = npmCliPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
const args = npmCliPath
  ? [npmCliPath, "run", "smoke:ui"]
  : ["run", "smoke:ui"];

const child = spawn(command, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    SMOKE_CAPTURE_VISUAL_BASELINES: "1",
  },
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
