import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.A11Y_BASE_URL || process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const routeSpecs = [
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
        await verifyRouteAccessibility(page, routeSpec, viewportSpec);
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
