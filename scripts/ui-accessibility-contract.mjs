import process from "node:process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";
import { operationalContractRouteSpecs } from "./lib/ui-operational-contract-matrix.mjs";
import {
  completeTwoFactorLoginIfNeeded,
  ensureLoginPageVisible,
  probeAuthSession,
  submitPasswordLoginWithRetry,
  waitForAuthenticatedShell,
} from "./ui-auth-contract-utils.mjs";

const baseUrl = process.env.A11Y_BASE_URL || process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";
const authUsername = String(process.env.A11Y_TEST_USERNAME || process.env.SMOKE_TEST_USERNAME || "").trim();
const authPassword = String(process.env.A11Y_TEST_PASSWORD || process.env.SMOKE_TEST_PASSWORD || "").trim();
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const A11Y_NAVIGATION_TIMEOUT_MS = 30_000;
const A11Y_LOAD_STATE_TIMEOUT_MS = 10_000;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const formatCleanupError = (error) => (error instanceof Error ? error.message : String(error));

const publicRouteSpecs = [
  {
    id: "login",
    path: "/login",
    contentSelector: ".login-card",
  },
  {
    id: "forgot-password",
    path: "/forgot-password",
    contentSelector: ".public-auth-layout__card",
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
  {
    id: "dashboard",
    path: "/dashboard",
    contentSelector: '[data-testid="text-dashboard-title"]',
  },
  {
    id: "ai",
    path: "/ai",
    contentSelector: "main#main-content",
  },
  {
    id: "settings",
    path: "/settings",
    contentSelector: "main#main-content",
  },
  ...operationalContractRouteSpecs,
];

const viewportSpecs = [
  { id: "desktop", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
];

const navigateForAccessibilityContract = async (page, routePath) => {
  await page.goto(`${baseUrl}${routePath}`, {
    timeout: A11Y_NAVIGATION_TIMEOUT_MS,
    waitUntil: "domcontentloaded",
  });

  // Authenticated pages keep background polling, telemetry, and WebSockets alive.
  // Accessibility checks need rendered DOM readiness, not a fragile networkidle state.
  await page.waitForLoadState("load", {
    timeout: A11Y_LOAD_STATE_TIMEOUT_MS,
  }).catch(() => undefined);
};

const readAccessibilitySummary = async (page, routeSpec) =>
  page.evaluate(({ contentSelector }) => {
    const isVisuallyHiddenFocusableUtility = (element, style, rect) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      const normalizedClip = String(style.clip || "").replace(/\s+/g, "");
      const normalizedClipPath = String(style.clipPath || "").replace(/\s+/g, "");
      const isClippedAway = normalizedClip === "rect(0px,0px,0px,0px)"
        || normalizedClipPath.includes("inset(50%)");
      const isUtilityFocusGuard = (style.position === "fixed" || style.position === "absolute")
        && rect.width <= 1
        && rect.height <= 1
        && !element.textContent?.trim();

      return isClippedAway && isUtilityFocusGuard;
    };

    const isElementVisible = (element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (isVisuallyHiddenFocusableUtility(element, style, rect)) {
        return false;
      }

      return style.display !== "none"
        && style.visibility !== "hidden"
        && rect.width > 0
        && rect.height > 0;
    };

    const textFromIdRefs = (value) => String(value || "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() || "")
      .filter(Boolean)
      .join(" ")
      .trim();

    const getAccessibleName = (element) => {
      const labelledBy = textFromIdRefs(element.getAttribute("aria-labelledby"));
      if (labelledBy) {
        return labelledBy;
      }

      const ariaLabel = element.getAttribute("aria-label")?.trim();
      if (ariaLabel) {
        return ariaLabel;
      }

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        const label = element.id
          ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent?.trim()
          : "";
        if (label) {
          return label;
        }

        const wrappingLabel = element.closest("label")?.textContent?.trim();
        if (wrappingLabel) {
          return wrappingLabel;
        }

        const placeholder = element.getAttribute("placeholder")?.trim();
        if (placeholder) {
          return placeholder;
        }
      }

      if (element instanceof HTMLImageElement) {
        return element.alt.trim();
      }

      const title = element.getAttribute("title")?.trim();
      if (title) {
        return title;
      }

      return element.textContent?.trim() || "";
    };

    const describeElement = (element) => {
      const id = element.id ? `#${element.id}` : "";
      const testId = element.getAttribute("data-testid");
      const testIdLabel = testId ? `[data-testid="${testId}"]` : "";
      return `${element.tagName.toLowerCase()}${id}${testIdLabel}`;
    };

    const focusableSelector = [
      "a[href]",
      "button",
      "input:not([type='hidden'])",
      "select",
      "textarea",
      "[tabindex]:not([tabindex='-1'])",
      "[role='button']",
      "[role='link']",
      "[role='textbox']",
    ].join(",");
    const focusable = Array.from(document.querySelectorAll(focusableSelector))
      .filter((element) => element instanceof HTMLElement)
      .filter((element) => !element.hasAttribute("disabled"))
      .filter((element) => element.getAttribute("aria-disabled") !== "true")
      .filter(isElementVisible);
    const missingAccessibleNames = focusable
      .filter((element) => !getAccessibleName(element))
      .map(describeElement);
    const ariaHiddenFocusable = focusable
      .filter((element) => element.closest("[aria-hidden='true']"))
      .map(describeElement);
    const idCounts = new Map();

    Array.from(document.querySelectorAll("[id]")).forEach((element) => {
      const id = element.id.trim();
      if (id) {
        idCounts.set(id, (idCounts.get(id) || 0) + 1);
      }
    });

    const duplicateIds = Array.from(idCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([id, count]) => ({ id, count }));
    const contentRoot = document.querySelector(contentSelector);

    return {
      ariaHiddenFocusable,
      duplicateIds,
      focusableCount: focusable.length,
      headingCount: document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']").length,
      mainCount: document.querySelectorAll("main,[role='main']").length,
      missingAccessibleNames,
      missingContentSelector: !(contentRoot instanceof HTMLElement),
    };
  }, routeSpec);

async function verifyAxeAccessibility(page, label) {
  await page.addScriptTag({ content: axeSource });
  const axeResult = await page.evaluate(async () => {
    const axe = window.axe;
    return axe.run(document, {
      resultTypes: ["violations"],
    });
  });
  const violations = axeResult.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => {
      const details = violation.nodes
        .slice(0, 2)
        .map((node) => {
          const targets = node.target.join(", ");
          const html = String(node.html || "").replace(/\s+/g, " ").trim();
          const summary = String(node.failureSummary || "").replace(/\s+/g, " ").trim();
          const parts = [targets, html, summary].filter(Boolean);
          return parts.join(" | ");
        })
        .join(" ; ");
      return `${violation.id} (${violation.impact})${details ? `: ${details}` : ""}`;
    });

  assert(
    violations.length === 0,
    `${label}: axe serious/critical accessibility violations: ${violations.join("; ")}`,
  );
}

async function verifyKeyboardFocus(page, label) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) {
        return { label: "none", visible: false };
      }

      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible = style.display !== "none"
        && style.visibility !== "hidden"
        && rect.width > 0
        && rect.height > 0;
      const name = element.getAttribute("aria-label")
        || element.textContent?.trim()
        || element.getAttribute("name")
        || element.id
        || element.tagName.toLowerCase();
      return {
        label: name,
        visible,
      };
    });

    if (focused.visible) {
      return;
    }
  }

  throw new Error(`${label}: keyboard tab navigation did not land on a visible focus target`);
}

async function verifyLoginFormErrorAnnouncement(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await navigateForAccessibilityContract(page, "/login");
  await ensureLoginPageVisible(page, "Accessibility screen reader login validation");
  await page.getByTestId("button-login").click();
  await page.locator("#login-username-error[role='alert']").waitFor({ timeout: 10_000 });
  await page.locator("#login-password-error[role='alert']").waitFor({ timeout: 10_000 });

  const summary = await page.evaluate(() => {
    const username = document.getElementById("login-username");
    const password = document.getElementById("login-password");
    return {
      usernameDescribedBy: username?.getAttribute("aria-describedby") || "",
      usernameInvalid: username?.getAttribute("aria-invalid") || "",
      usernameErrorText: document.getElementById("login-username-error")?.textContent?.trim() || "",
      passwordDescribedBy: password?.getAttribute("aria-describedby") || "",
      passwordInvalid: password?.getAttribute("aria-invalid") || "",
      passwordErrorText: document.getElementById("login-password-error")?.textContent?.trim() || "",
    };
  });

  assert(summary.usernameInvalid === "true", "login validation should mark username invalid");
  assert(summary.passwordInvalid === "true", "login validation should mark password invalid");
  assert(
    summary.usernameDescribedBy.split(/\s+/).includes("login-username-error"),
    "username input should describe the alert message",
  );
  assert(
    summary.passwordDescribedBy.split(/\s+/).includes("login-password-error"),
    "password input should describe the alert message",
  );
  assert(summary.usernameErrorText.length > 0, "username alert should contain readable text");
  assert(summary.passwordErrorText.length > 0, "password alert should contain readable text");
}

async function verifyFloatingAiScreenReaderScenario(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await navigateForAccessibilityContract(page, "/settings");
  await page.locator("main#main-content").first().waitFor({ timeout: 15_000 });

  const trigger = page.getByTestId("floating-ai-toggle");
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  await trigger.click();

  const dialog = page.locator('[data-floating-ai-dialog="true"][role="dialog"]').first();
  await dialog.waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('[role="log"][aria-live="polite"]').first().waitFor({ timeout: 15_000 });

  const dialogSummary = await page.evaluate(() => {
    const dialogElement = document.querySelector('[data-floating-ai-dialog="true"][role="dialog"]');
    const logElement = document.querySelector('[role="log"][aria-live="polite"]');
    const titleId = dialogElement?.getAttribute("aria-labelledby") || "";
    const descriptionId = dialogElement?.getAttribute("aria-describedby") || "";
    return {
      ariaExpanded: document.querySelector('[data-testid="floating-ai-toggle"]')?.getAttribute("aria-expanded"),
      descriptionText: descriptionId ? document.getElementById(descriptionId)?.textContent?.trim() || "" : "",
      hasLog: Boolean(logElement),
      logLabel: logElement?.getAttribute("aria-label") || "",
      titleText: titleId ? document.getElementById(titleId)?.textContent?.trim() || "" : "",
    };
  });

  assert(dialogSummary.ariaExpanded === "true", "floating AI trigger should expose expanded state");
  assert(dialogSummary.titleText.length > 0, "floating AI dialog should have a labelled title");
  assert(dialogSummary.descriptionText.length > 0, "floating AI dialog should have a description");
  assert(dialogSummary.hasLog, "floating AI chat should expose a polite log region");
  assert(dialogSummary.logLabel.length > 0, "floating AI log region should have an accessible label");

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 10_000 });

  const focusReturned = await page.evaluate(() =>
    document.activeElement?.getAttribute("data-testid") === "floating-ai-toggle");
  assert(focusReturned, "floating AI Escape should return focus to the trigger");
}

async function verifyRouteAccessibility(page, routeSpec, viewportSpec) {
  await page.setViewportSize({
    width: viewportSpec.width,
    height: viewportSpec.height,
  });
  await navigateForAccessibilityContract(page, routeSpec.path);
  await page.locator(routeSpec.contentSelector).first().waitFor();
  if (routeSpec.readySelector) {
    await page.locator(routeSpec.readySelector).first().waitFor({ timeout: 15_000 });
  }

  const summary = await readAccessibilitySummary(page, routeSpec);
  const label = `${routeSpec.id}/${viewportSpec.id}`;
  await verifyAxeAccessibility(page, label);
  await verifyKeyboardFocus(page, label);

  assert(!summary.missingContentSelector, `${label}: missing ${routeSpec.contentSelector}`);
  assert(summary.mainCount >= 1, `${label}: page is missing a main landmark`);
  assert(summary.headingCount >= 1, `${label}: page is missing a heading`);
  assert(summary.focusableCount >= 1, `${label}: page has no visible focusable controls`);
  assert(
    summary.missingAccessibleNames.length === 0,
    `${label}: focusable controls missing accessible names: ${summary.missingAccessibleNames.join(", ")}`,
  );
  assert(
    summary.ariaHiddenFocusable.length === 0,
    `${label}: focusable controls are hidden from assistive tech: ${summary.ariaHiddenFocusable.join(", ")}`,
  );
  assert(
    summary.duplicateIds.length === 0,
    `${label}: duplicate ids detected: ${summary.duplicateIds
      .map((item) => `${item.id} x${item.count}`)
      .join(", ")}`,
  );
}

async function loginForAuthenticatedContracts(page) {
  await navigateForAccessibilityContract(page, "/login");
  await ensureLoginPageVisible(page, "Accessibility contract");
  const { loginPayload, loginResponse } = await submitPasswordLoginWithRetry(page, {
    contextLabel: "Accessibility contract login",
    password: authPassword,
    username: authUsername,
  });
  const twoFactorResult = await completeTwoFactorLoginIfNeeded(page, {
    loginPayload,
    username: authUsername,
    contextLabel: "Accessibility contract login",
  });
  const finalLoginPayload = twoFactorResult?.verifyPayload ?? loginPayload;
  const finalLoginResponse = twoFactorResult?.verifyResponse ?? loginResponse;
  const authProbe = await probeAuthSession(page);
  assert(
    finalLoginResponse.ok() && authProbe.ok && authProbe.hasUser,
    [
      `authenticated a11y login failed with HTTP ${finalLoginResponse.status()}`,
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
  await waitForAuthenticatedShell(page, "Accessibility contract login");
  await navigateForAccessibilityContract(page, "/");
  await waitForAuthenticatedShell(page, "Authenticated accessibility login reload");
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
    `authenticated a11y logout cleanup failed with HTTP ${response.status}`,
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
    bypassCSP: true,
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
        await verifyRouteAccessibility(page, routeSpec, viewportSpec);
      }
    }
    await verifyLoginFormErrorAnnouncement(page);

    if (!authUsername || !authPassword) {
      console.log(
        "Skipping authenticated accessibility contract routes because A11Y_TEST_USERNAME/A11Y_TEST_PASSWORD (or SMOKE_TEST_USERNAME/SMOKE_TEST_PASSWORD) are not set.",
      );
      return;
    }

    await loginForAuthenticatedContracts(page);
    authenticatedSessionCreated = true;
    for (const viewportSpec of viewportSpecs) {
      for (const routeSpec of authenticatedRouteSpecs) {
        await verifyRouteAccessibility(page, routeSpec, viewportSpec);
      }
    }
    await verifyFloatingAiScreenReaderScenario(page);
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
          console.warn(`Authenticated accessibility logout cleanup failed after primary error: ${message}`);
        }
      }
    }
    await context.close().catch((error) => {
      if (!primaryError && !cleanupError) {
        cleanupError = error;
        return;
      }
      console.warn(`Authenticated accessibility context cleanup failed: ${formatCleanupError(error)}`);
    });
    await browser.close().catch((error) => {
      if (!primaryError && !cleanupError) {
        cleanupError = error;
        return;
      }
      console.warn(`Authenticated accessibility browser cleanup failed: ${formatCleanupError(error)}`);
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
