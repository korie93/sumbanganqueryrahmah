import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";
const username = process.env.SMOKE_TEST_USERNAME || "";
const password = process.env.SMOKE_TEST_PASSWORD || "";
const errors = [];

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const createTracker = () => {
  const failedRequests = [];
  const consoleMessages = [];

  return {
    failedRequests,
    consoleMessages,
    attach(page) {
      page.on("requestfailed", (request) => {
        const errorText = request.failure()?.errorText || "unknown";
        if (errorText === "net::ERR_ABORTED") {
          return;
        }
        failedRequests.push(`${request.method()} ${request.url()} :: ${errorText}`);
      });

      page.on("console", (message) => {
        const type = message.type();
        if (type === "error" || type === "warning") {
          consoleMessages.push(`[${type}] ${message.text()}`);
        }
      });

      page.on("response", (response) => {
        const url = response.url();
        if (url.includes("/api/me") && response.status() >= 400) {
          failedRequests.push(`GET ${url} :: ${response.status()}`);
        }
      });
    },
    assertClean(contextLabel) {
      assert(
        failedRequests.length === 0,
        `${contextLabel}: unexpected failed requests:\n${failedRequests.join("\n")}`,
      );
      assert(
        consoleMessages.length === 0,
        `${contextLabel}: unexpected console errors/warnings:\n${consoleMessages.join("\n")}`,
      );
    },
    clear() {
      failedRequests.length = 0;
      consoleMessages.length = 0;
    },
  };
};

const checkRoute = async (page, tracker, path, expectedText, contextLabel) => {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(`text="${expectedText}"`);
  tracker.assertClean(contextLabel);
  tracker.clear();
};

const readCookieNames = async (context) =>
  new Set((await context.cookies(baseUrl)).map((cookie) => cookie.name));

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const tracker = createTracker();
  tracker.attach(page);

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForSelector('text="Log In SQR System"');

    await context.clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(
        "user",
        JSON.stringify({
          id: 999,
          username: "stale-user",
          role: "superuser",
          fullName: "Stale User",
          status: "active",
          mustChangePassword: false,
          passwordResetBySuperuser: false,
          isBanned: false,
        }),
      );
      localStorage.setItem("activeTab", "home");
    });
    await page.reload({ waitUntil: "networkidle" });
    const staleUserValue = await page.evaluate(() => localStorage.getItem("user"));
    assert(staleUserValue === null, "stale localStorage user should be cleared when no auth cookie exists");
    await page.waitForSelector('text="Log In SQR System"');
    tracker.assertClean("unauth bootstrap");
    tracker.clear();

    if (username && password) {
      await page.getByPlaceholder("Username").fill(username);
      await page.getByPlaceholder("Password").fill(password);
      await page.getByRole("button", { name: "Log In" }).click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(250);

      const cookieNames = await readCookieNames(context);
      assert(cookieNames.has("sqr_auth"), "auth session cookie should exist after login");
      assert(cookieNames.has("sqr_auth_hint"), "auth session hint cookie should exist after login");

      const bodyText = (await page.locator("body").innerText()).toLowerCase();
      assert(!bodyText.includes("log in sqr system"), "login page should be replaced after successful login");
      tracker.assertClean("login");
      tracker.clear();

      await checkRoute(
        page,
        tracker,
        "/collection/records",
        "View Rekod Collection",
        "collection records route",
      );
      await checkRoute(
        page,
        tracker,
        "/collection/summary",
        "Collection Summary",
        "collection summary route",
      );
      await checkRoute(
        page,
        tracker,
        "/settings",
        "Settings Categories",
        "settings route",
      );
    } else {
      console.log(
        "Skipping authenticated smoke navigation because SMOKE_TEST_USERNAME and SMOKE_TEST_PASSWORD are not set.",
      );
    }
  } finally {
    await browser.close();
  }
};

run().catch((error) => {
  let message = error instanceof Error ? error.stack || error.message : String(error);
  if (message.includes("ERR_CONNECTION_REFUSED")) {
    message = `${message}\n\nSmoke UI requires the app server to be running at ${baseUrl}. Start it first with: npm start`;
  }
  errors.push(message);
  console.error(message);
  process.exitCode = 1;
});
