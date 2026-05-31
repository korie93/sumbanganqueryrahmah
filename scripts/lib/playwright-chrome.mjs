import { accessSync, constants } from "node:fs";
import path from "node:path";

function assertExecutablePath(chromePath, source) {
  if (!path.isAbsolute(chromePath)) {
    throw new Error(`${source} must be an absolute path.`);
  }

  try {
    accessSync(chromePath, constants.X_OK);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${source} is not an executable browser path: ${chromePath}. ${message}`);
  }
}

export function resolvePlaywrightLaunchOptions({
  env = process.env,
  headless = true,
} = {}) {
  const explicitChromePath = String(env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || env.CHROME_PATH || "").trim();
  if (!explicitChromePath) {
    return { headless };
  }

  assertExecutablePath(
    explicitChromePath,
    env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH" : "CHROME_PATH",
  );
  return {
    executablePath: explicitChromePath,
    headless,
  };
}
