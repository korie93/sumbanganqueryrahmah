import process from "node:process";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";
import {
  completeTwoFactorLoginIfNeeded,
  ensureLoginPageVisible,
  probeAuthSession,
  submitPasswordLoginWithRetry,
  waitForAuthenticatedShell,
} from "./ui-auth-contract-utils.mjs";

const baseUrl = process.env.VISUAL_BASE_URL || process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";
const rawArtifactsDir = String(process.env.VISUAL_ARTIFACTS_DIR || "").trim();
const artifactsDir = rawArtifactsDir ? path.resolve(process.cwd(), rawArtifactsDir) : "";
const authUsername = String(process.env.VISUAL_TEST_USERNAME || process.env.SMOKE_TEST_USERNAME || "").trim();
const authPassword = String(process.env.VISUAL_TEST_PASSWORD || process.env.SMOKE_TEST_PASSWORD || "").trim();
const VISUAL_NAVIGATION_TIMEOUT_MS = 30_000;
const VISUAL_LOAD_STATE_TIMEOUT_MS = 10_000;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const formatCleanupError = (error) => (error instanceof Error ? error.message : String(error));

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

const navigateForVisualContract = async (page, routePath) => {
  await page.goto(`${baseUrl}${routePath}`, {
    timeout: VISUAL_NAVIGATION_TIMEOUT_MS,
    waitUntil: "domcontentloaded",
  });

  // The authenticated app keeps polling, telemetry, and WebSocket activity alive.
  // Visual contracts assert rendered layout, so waiting for DOM + selectors is
  // more deterministic than Playwright's networkidle heuristic.
  await page.waitForLoadState("load", {
    timeout: VISUAL_LOAD_STATE_TIMEOUT_MS,
  }).catch(() => undefined);
};

const publicRouteSpecs = [
  {
    id: "login",
    path: "/login",
    contentSelector: ".login-shell",
    primarySelector: "[data-testid='button-login']",
  },
  {
    id: "forgot-password",
    path: "/forgot-password",
    contentSelector: ".public-auth-layout__card",
    primarySelector: ".public-auth-layout__content button",
  },
];

const authenticatedRouteSpecs = [
  {
    id: "authenticated-home",
    path: "/",
    contentSelector: "main#main-content",
  },
  {
    id: "dashboard",
    path: "/dashboard",
    contentSelector: "main#main-content",
  },
  {
    id: "collection-records",
    path: "/collection/save",
    contentSelector: "main#main-content",
  },
  {
    id: "ai",
    path: "/ai",
    contentSelector: "main#main-content",
    primarySelector: "textarea[name='aiConversationQuery']",
  },
  {
    id: "viewer",
    path: "/viewer",
    contentSelector: "main#main-content",
  },
  {
    id: "settings",
    path: "/settings",
    contentSelector: "main#main-content",
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
  await navigateForVisualContract(page, routeSpec.path);

  if (routeSpec.path === "/login") {
    await ensureLoginPageVisible(page, `${routeSpec.id}/${viewportSpec.id}`);
  }

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

async function loginForAuthenticatedContracts(page) {
  await navigateForVisualContract(page, "/login");
  await ensureLoginPageVisible(page, "Visual contract");
  const { loginPayload, loginResponse } = await submitPasswordLoginWithRetry(page, {
    contextLabel: "Visual contract login",
    password: authPassword,
    username: authUsername,
  });
  const twoFactorResult = await completeTwoFactorLoginIfNeeded(page, {
    loginPayload,
    username: authUsername,
    contextLabel: "Visual contract login",
  });
  const finalLoginPayload = twoFactorResult?.verifyPayload ?? loginPayload;
  const finalLoginResponse = twoFactorResult?.verifyResponse ?? loginResponse;
  const authProbe = await probeAuthSession(page);

  assert(finalLoginResponse.ok(), `authenticated visual login failed with HTTP ${finalLoginResponse.status()}`);
  assert(
    authProbe.ok && authProbe.hasUser,
    [
      "authenticated visual login did not establish a usable session",
      `POST /api/auth/login status: ${loginResponse.status()}`,
      `POST /api/auth/login message: ${String(loginPayload?.message || "(none)")}`,
      twoFactorResult
        ? `POST /api/auth/verify-two-factor-login status: ${twoFactorResult.verifyResponse.status()}`
        : "POST /api/auth/verify-two-factor-login status: (not required)",
      twoFactorResult
        ? `POST /api/auth/verify-two-factor-login message: ${String(finalLoginPayload?.message || "(none)")}`
        : "POST /api/auth/verify-two-factor-login message: (not required)",
      `GET /api/me status: ${authProbe.status}`,
      `GET /api/me message: ${String(authProbe.message || "(none)")}`,
    ].join("\n"),
  );

  await waitForAuthenticatedShell(page, "Visual contract login");

  await navigateForVisualContract(page, "/");
  await waitForAuthenticatedShell(page, "Authenticated visual login reload");
  await page.locator("main#main-content").first().waitFor({ timeout: 15_000 });
}

async function logoutAuthenticatedContractSession(page) {
  const response = await page.evaluate(async () => {
    const logoutResponse = await fetch("/api/activity/logout", {
      body: "{}",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    return {
      ok: logoutResponse.ok,
      status: logoutResponse.status,
    };
  });

  assert(
    response.ok || response.status === 401,
    `authenticated visual logout cleanup failed with HTTP ${response.status}`,
  );

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

const run = async () => {
  const browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  const context = await browser.newContext({
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  });

  let authenticatedSessionCreated = false;
  let primaryError = null;

  try {
    const page = await context.newPage();

    for (const viewportSpec of viewportSpecs) {
      for (const routeSpec of publicRouteSpecs) {
        await verifyRouteLayout(page, routeSpec, viewportSpec);
      }
    }

    if (!authUsername || !authPassword) {
      console.log(
        "Skipping authenticated visual contract routes because VISUAL_TEST_USERNAME/VISUAL_TEST_PASSWORD (or SMOKE_TEST_USERNAME/SMOKE_TEST_PASSWORD) are not set.",
      );
      return;
    }

    await loginForAuthenticatedContracts(page);
    authenticatedSessionCreated = true;
    for (const viewportSpec of viewportSpecs) {
      for (const routeSpec of authenticatedRouteSpecs) {
        await verifyRouteLayout(page, routeSpec, viewportSpec);
      }
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let cleanupError = null;
    if (authenticatedSessionCreated) {
      const page = context.pages()[0];
      try {
        if (page) {
          await logoutAuthenticatedContractSession(page);
        }
      } catch (error) {
        if (!primaryError) {
          cleanupError = error;
        } else {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`Authenticated visual logout cleanup failed after primary error: ${message}`);
        }
      }
    }
    await context.close().catch((error) => {
      if (!primaryError && !cleanupError) {
        cleanupError = error;
        return;
      }
      console.warn(`Authenticated visual context cleanup failed: ${formatCleanupError(error)}`);
    });
    await browser.close().catch((error) => {
      if (!primaryError && !cleanupError) {
        cleanupError = error;
        return;
      }
      console.warn(`Authenticated visual browser cleanup failed: ${formatCleanupError(error)}`);
    });
    if (cleanupError) {
      throw cleanupError;
    }
  }
};

run().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
