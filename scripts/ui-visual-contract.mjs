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
    scrollSelector: "#dashboard-recent-login-activity",
    readySelector: "[data-testid='card-recent-login-activity']",
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

const dashboardZoomViewportSpecs = [
  { id: "zoom-in", width: 800, height: 900 },
  { id: "zoom-out-boundary", width: 1536, height: 900 },
  { id: "zoom-out", width: 1920, height: 900 },
];

const readLayoutSummary = async (page, { contentSelector, primarySelector, readySelector }) =>
  page.evaluate(({ contentSelector: nextContentSelector, primarySelector: nextPrimarySelector, readySelector: nextReadySelector }) => {
    const root = document.querySelector(nextContentSelector);
    const main = document.querySelector("main");
    const primary = nextPrimarySelector ? document.querySelector(nextPrimarySelector) : null;
    const ready = nextReadySelector ? document.querySelector(nextReadySelector) : null;

    if (
      !(root instanceof HTMLElement)
      || !(main instanceof HTMLElement)
      || (nextReadySelector && !(ready instanceof HTMLElement))
    ) {
      return {
        missingSelector: !(root instanceof HTMLElement)
          ? nextContentSelector
          : !(main instanceof HTMLElement)
            ? "main"
            : nextReadySelector,
      };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rootRect = root.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const primaryRect = primary instanceof HTMLElement ? primary.getBoundingClientRect() : null;
    const readyRect = ready instanceof HTMLElement ? ready.getBoundingClientRect() : null;

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
      ready: readyRect && ready instanceof HTMLElement
        ? {
            clientWidth: ready.clientWidth,
            left: readyRect.left,
            right: readyRect.right,
            scrollWidth: ready.scrollWidth,
          }
        : null,
      viewportHeight,
      viewportWidth,
    };
  }, { contentSelector, primarySelector, readySelector });

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
  if (routeSpec.scrollSelector) {
    await page.locator(routeSpec.scrollSelector).first().scrollIntoViewIfNeeded();
  }
  if (routeSpec.readySelector) {
    await page.locator(routeSpec.readySelector).first().waitFor({ timeout: 15_000 });
  }

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

  if (layoutSummary.ready) {
    assert(
      layoutSummary.ready.left >= -1
        && layoutSummary.ready.right <= layoutSummary.viewportWidth + 1,
      `${routeSpec.id}/${viewportSpec.id}: protected surface escaped the viewport width`,
    );
    assert(
      layoutSummary.ready.scrollWidth <= layoutSummary.ready.clientWidth + 1,
      `${routeSpec.id}/${viewportSpec.id}: protected surface has internal horizontal overflow`,
    );
  }

  if (layoutSummary.primary) {
    assert(
      layoutSummary.primary.top >= -1
        && layoutSummary.primary.bottom <= layoutSummary.viewportHeight + 1,
      `${routeSpec.id}/${viewportSpec.id}: primary action is not fully visible in the initial viewport`,
    );
  }
}

async function waitForTestIdFocus(page, testId) {
  await page.waitForFunction((nextTestId) => (
    document.activeElement instanceof HTMLElement
    && document.activeElement.dataset.testid === nextTestId
  ), testId, { timeout: 2_000 }).catch(() => undefined);
}

async function verifyDashboardRecentActivityDetailLayout(page, viewportSpec) {
  const trigger = page.locator('[data-testid^="button-recent-login-details-"]').first();
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  const triggerTestId = await trigger.getAttribute("data-testid");
  assert(triggerTestId, `dashboard/${viewportSpec.id}: recent activity detail trigger is missing its test id`);
  await trigger.click();

  const detailSheet = page.getByTestId("recent-login-activity-detail-sheet");
  await detailSheet.waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="recent-login-activity-detail-sheet"]');
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.left >= -1 && rect.right <= window.innerWidth + 1;
  }, undefined, { timeout: 2_000 }).catch(() => undefined);
  const detailLayout = await detailSheet.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      clientWidth: element.clientWidth,
      left: rect.left,
      right: rect.right,
      scrollWidth: element.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  assert(
    detailLayout.left >= -1 && detailLayout.right <= detailLayout.viewportWidth + 1,
    `dashboard/${viewportSpec.id}: recent activity detail escaped the viewport width`,
  );
  assert(
    detailLayout.scrollWidth <= detailLayout.clientWidth + 1,
    `dashboard/${viewportSpec.id}: recent activity detail has internal horizontal overflow`,
  );

  await page.keyboard.press("Escape");
  await detailSheet.waitFor({ state: "hidden", timeout: 10_000 });
  await waitForTestIdFocus(page, triggerTestId);
  assert(
    await trigger.evaluate((element) => document.activeElement === element),
    `dashboard/${viewportSpec.id}: recent activity detail did not return focus to its trigger`,
  );
}

async function verifyDashboardCleanupDialogLayout(page, viewportSpec) {
  const trigger = page.getByTestId("button-recent-login-cleanup-ended");
  await trigger.waitFor({ state: "visible", timeout: 10_000 });
  const triggerTestId = await trigger.getAttribute("data-testid");
  assert(triggerTestId, `dashboard/${viewportSpec.id}: cleanup dialog trigger is missing its test id`);
  await trigger.click();

  const dialog = page.getByRole("alertdialog", { name: "Clean up old ended login logs?" });
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  const dialogLayout = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      clientWidth: element.clientWidth,
      left: rect.left,
      right: rect.right,
      scrollWidth: element.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  assert(
    dialogLayout.left >= -1 && dialogLayout.right <= dialogLayout.viewportWidth + 1,
    `dashboard/${viewportSpec.id}: cleanup dialog escaped the viewport width`,
  );
  assert(
    dialogLayout.scrollWidth <= dialogLayout.clientWidth + 1,
    `dashboard/${viewportSpec.id}: cleanup dialog has internal horizontal overflow`,
  );

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 10_000 });
  await waitForTestIdFocus(page, triggerTestId);
  assert(
    await trigger.evaluate((element) => document.activeElement === element),
    `dashboard/${viewportSpec.id}: cleanup dialog did not return focus to its trigger`,
  );
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
    const dashboardRouteSpec = authenticatedRouteSpecs.find((routeSpec) => routeSpec.id === "dashboard");
    if (dashboardRouteSpec) {
      for (const viewportSpec of dashboardZoomViewportSpecs) {
        await verifyRouteLayout(page, dashboardRouteSpec, viewportSpec);
        await verifyDashboardRecentActivityDetailLayout(page, viewportSpec);
        await verifyDashboardCleanupDialogLayout(page, viewportSpec);
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
