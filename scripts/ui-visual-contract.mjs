import process from "node:process";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.VISUAL_BASE_URL || process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";
const rawArtifactsDir = String(process.env.VISUAL_ARTIFACTS_DIR || "").trim();
const artifactsDir = rawArtifactsDir ? path.resolve(process.cwd(), rawArtifactsDir) : "";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const ensureArtifactsDir = async () => {
  if (!artifactsDir) {
    return;
  }
  await mkdir(artifactsDir, { recursive: true });
};

const captureRouteArtifacts = async (page, routeId, viewportId, layoutSummary) => {
  if (!artifactsDir) {
    return;
  }

  await ensureArtifactsDir();

  await page.screenshot({
    path: path.join(artifactsDir, `${routeId}-${viewportId}.png`),
    fullPage: true,
  });
  await writeFile(
    path.join(artifactsDir, `${routeId}-${viewportId}.json`),
    JSON.stringify(layoutSummary, null, 2),
    "utf8",
  );
};

const routeSpecs = [
  {
    id: "login",
    path: "/login",
    contentSelector: ".login-card",
    primarySelector: "[data-testid='button-login']",
  },
  {
    id: "forgot-password",
    path: "/forgot-password",
    contentSelector: ".public-auth-layout__card",
    primarySelector: ".public-auth-layout__content button",
  },
];

const viewportSpecs = [
  { id: "desktop", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
];

const readLayoutSummary = async (page, { contentSelector, primarySelector }) =>
  page.evaluate(({ contentSelector: nextContentSelector, primarySelector: nextPrimarySelector }) => {
    const root = document.querySelector(nextContentSelector);
    const main = document.querySelector("main");
    const primary = nextPrimarySelector ? document.querySelector(nextPrimarySelector) : null;

    if (!(root instanceof HTMLElement) || !(main instanceof HTMLElement)) {
      return {
        missingSelector: !(root instanceof HTMLElement) ? nextContentSelector : "main",
      };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rootRect = root.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const primaryRect = primary instanceof HTMLElement ? primary.getBoundingClientRect() : null;

    return {
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      main: {
        left: mainRect.left,
        right: mainRect.right,
        top: mainRect.top,
        bottom: mainRect.bottom,
      },
      content: {
        left: rootRect.left,
        right: rootRect.right,
        top: rootRect.top,
        bottom: rootRect.bottom,
      },
      primary: primaryRect
        ? {
            left: primaryRect.left,
            right: primaryRect.right,
            top: primaryRect.top,
            bottom: primaryRect.bottom,
          }
        : null,
      viewportHeight,
      viewportWidth,
    };
  }, { contentSelector, primarySelector });

async function verifyRouteLayout(page, routeSpec, viewportSpec) {
  await page.setViewportSize({
    width: viewportSpec.width,
    height: viewportSpec.height,
  });
  await page.goto(`${baseUrl}${routeSpec.path}`, { waitUntil: "networkidle" });
  await page.locator(routeSpec.contentSelector).first().waitFor();

  const layoutSummary = await readLayoutSummary(page, routeSpec);
  await captureRouteArtifacts(page, routeSpec.id, viewportSpec.id, layoutSummary);

  assert(
    !layoutSummary.missingSelector,
    `${routeSpec.id}/${viewportSpec.id}: missing ${layoutSummary.missingSelector}`,
  );

  assert(
    layoutSummary.documentScrollWidth <= layoutSummary.documentClientWidth + 1,
    `${routeSpec.id}/${viewportSpec.id}: horizontal overflow detected`,
  );
  assert(
    layoutSummary.content.left >= -1
      && layoutSummary.content.right <= layoutSummary.viewportWidth + 1,
    `${routeSpec.id}/${viewportSpec.id}: auth shell overflowed the viewport width`,
  );
  assert(
    layoutSummary.main.left >= -1
      && layoutSummary.main.right <= layoutSummary.viewportWidth + 1,
    `${routeSpec.id}/${viewportSpec.id}: main content escaped the viewport width`,
  );

  if (layoutSummary.primary) {
    assert(
      layoutSummary.primary.top >= -1
        && layoutSummary.primary.bottom <= layoutSummary.viewportHeight + 1,
      `${routeSpec.id}/${viewportSpec.id}: primary action is not fully visible in the initial viewport`,
    );
  }
}

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  });

  try {
    const page = await context.newPage();

    for (const viewportSpec of viewportSpecs) {
      for (const routeSpec of routeSpecs) {
        await verifyRouteLayout(page, routeSpec, viewportSpec);
      }
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
};

run().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
