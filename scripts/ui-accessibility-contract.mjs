import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.A11Y_BASE_URL || process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";
const authUsername = String(process.env.A11Y_TEST_USERNAME || process.env.SMOKE_TEST_USERNAME || "").trim();
const authPassword = String(process.env.A11Y_TEST_PASSWORD || process.env.SMOKE_TEST_PASSWORD || "").trim();

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

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
];

const viewportSpecs = [
  { id: "desktop", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
];

const readAccessibilitySummary = async (page, routeSpec) =>
  page.evaluate(({ contentSelector }) => {
    const isElementVisible = (element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
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

async function verifyRouteAccessibility(page, routeSpec, viewportSpec) {
  await page.setViewportSize({
    width: viewportSpec.width,
    height: viewportSpec.height,
  });
  await page.goto(`${baseUrl}${routeSpec.path}`, { waitUntil: "networkidle" });
  await page.locator(routeSpec.contentSelector).first().waitFor();

  const summary = await readAccessibilitySummary(page, routeSpec);
  const label = `${routeSpec.id}/${viewportSpec.id}`;

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
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST"
      && response.url().includes("/api/login"),
    { timeout: 15_000 },
  );
  await page.getByPlaceholder("Username").fill(authUsername);
  await page.getByPlaceholder("Password").fill(authPassword);
  await page.getByRole("button", { name: "Log In" }).click();
  const loginResponse = await loginResponsePromise;
  assert(
    loginResponse.ok(),
    `authenticated a11y login failed with HTTP ${loginResponse.status()}`,
  );
  await page.waitForLoadState("networkidle");
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
        await verifyRouteAccessibility(page, routeSpec, viewportSpec);
      }
    }

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
