import process from "node:process";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.VISUAL_BASE_URL || process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";
const rawArtifactsDir = String(process.env.VISUAL_ARTIFACTS_DIR || "").trim();
const artifactsDir = rawArtifactsDir ? path.resolve(process.cwd(), rawArtifactsDir) : "";
const authUsername = String(process.env.VISUAL_TEST_USERNAME || process.env.SMOKE_TEST_USERNAME || "").trim();
const authPassword = String(process.env.VISUAL_TEST_PASSWORD || process.env.SMOKE_TEST_PASSWORD || "").trim();

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

const publicRouteSpecs = [
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

const authenticatedRouteSpecs = [
  {
    id: "authenticated-home",
    path: "/",
    contentSelector: "main#main-content",
  },
  {
    id: "collection-records",
    path: "/collection/save",
    contentSelector: "main#main-content",
  },
  {
    id: "viewer",
    path: "/viewer",
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

const waitForVisible = async (locator, timeout = 10_000) => {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
};

const ensureLoginPageVisible = async (page) => {
  const loginHeading = page.getByRole("heading", {
    name: /^(Log Masuk SQR|Log In SQR System)$/,
    level: 1,
  });
  const usernameInput = page.getByTestId("input-username");

  if (await waitForVisible(loginHeading) || await waitForVisible(usernameInput)) {
    return;
  }

  const publicLoginButton = page.getByRole("button", { name: /^Log In$/ }).first();
  if (await waitForVisible(publicLoginButton, 2_000)) {
    await publicLoginButton.click();
    await page.waitForLoadState("networkidle");
    await usernameInput.waitFor({ state: "visible", timeout: 10_000 });
    await loginHeading.waitFor({ state: "visible", timeout: 10_000 });
    return;
  }

  const bodyText = await page.locator("body").innerText().catch(() => "(unavailable)");
  throw new Error(
    `Visual login page was not reachable after navigation. Visible body excerpt: ${bodyText.slice(0, 400)}`,
  );
};

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

async function loginForAuthenticatedContracts(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await ensureLoginPageVisible(page);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST"
      && response.url().includes("/api/login"),
    { timeout: 15_000 },
  );
  await page.getByTestId("input-username").fill(authUsername);
  await page.getByTestId("input-password").fill(authPassword);
  await page.getByTestId("button-login").click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);
  const loginResponse = await loginResponsePromise;
  let loginPayload = null;
  try {
    loginPayload = await loginResponse.json();
  } catch {
    loginPayload = null;
  }

  assert(loginResponse.ok(), `authenticated visual login failed with HTTP ${loginResponse.status()}`);
  assert(
    !(await page.getByTestId("input-username").isVisible().catch(() => false)),
    [
      "authenticated visual login did not leave the login screen",
      `POST /api/login status: ${loginResponse.status()}`,
      `POST /api/login message: ${String(loginPayload?.message || "(none)")}`,
    ].join("\n"),
  );
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
  const browser = await chromium.launch({ headless: true });
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
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
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
