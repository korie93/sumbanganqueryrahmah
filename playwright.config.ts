import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.VISUAL_BASE_URL
  || process.env.SMOKE_BASE_URL
  || "http://127.0.0.1:5000";
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || process.env.CHROME_PATH
  || undefined;
const visualMaxDiffPixelRatio = Number.parseFloat(
  process.env.VISUAL_MAX_DIFF_PIXEL_RATIO
  || (process.env.CI ? "0.05" : "0.001"),
);

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: Number.isFinite(visualMaxDiffPixelRatio)
        ? visualMaxDiffPixelRatio
        : 0.001,
      threshold: 0.2,
    },
    timeout: 15_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: "artifacts/playwright-test-results",
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "artifacts/playwright-report" }],
  ],
  retries: process.env.CI ? 1 : 0,
  snapshotPathTemplate: "{testDir}/__snapshots__/{testFilePath}/{arg}{ext}",
  testDir: "./tests/visual",
  timeout: 60_000,
  use: {
    baseURL,
    colorScheme: "light",
    launchOptions: chromiumExecutablePath
      ? { executablePath: chromiumExecutablePath }
      : undefined,
    locale: "en-US",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    timezoneId: "Asia/Kuala_Lumpur",
    trace: "retain-on-failure",
    video: "off",
    viewport: {
      height: 900,
      width: 1280,
    },
  },
});
