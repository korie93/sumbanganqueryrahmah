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

const openUserMenu = async (page) => {
  const trigger = page.locator('button[aria-label="Open user menu"]');
  await trigger.click();
  await page.getByRole("menuitemradio", { name: "Light Mode" }).waitFor();
};

const closeMenus = async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
};

const getNavGroupTrigger = (page, groupId) =>
  page.locator(`[data-testid^="nav-group-${groupId}"]`).first();

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
  await page.getByText(expectedText).first().waitFor();
  tracker.assertClean(contextLabel);
  tracker.clear();
};

const checkDesktopNavbar = async (page, tracker) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForLoadState("networkidle");

  await page.getByTestId("nav-home").waitFor();
  await page.getByRole("navigation").waitFor();
  await page.getByTestId("nav-general-search").waitFor();
  await page.getByTestId("nav-collection-report").waitFor();
  await getNavGroupTrigger(page, "workspace").waitFor();
  await getNavGroupTrigger(page, "insights").waitFor();
  await getNavGroupTrigger(page, "settings").waitFor();

  assert(
    await page.getByTestId("nav-backup").count() === 0,
    "Backup should not appear as a top-level desktop navbar button",
  );

  await getNavGroupTrigger(page, "settings").click();
  await page.getByRole("menuitem", { name: /Backup & Restore/i }).waitFor();
  await page.getByRole("menuitem", { name: /Backup & Restore/i }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForURL(/\/settings\?section=backup-restore/);
  await page.getByText("Backup & Restore").first().waitFor();

  tracker.assertClean("desktop navbar");
  tracker.clear();
};

const checkKeyboardMenuAccess = async (page, tracker) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForLoadState("networkidle");

  const settingsTrigger = getNavGroupTrigger(page, "settings");
  await settingsTrigger.focus();
  assert(
    await settingsTrigger.evaluate((element) => element === document.activeElement),
    "Settings menu trigger should be focusable from the keyboard",
  );
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: /Backup & Restore/i }).waitFor();
  assert(await settingsTrigger.getAttribute("aria-expanded") === "true", "Settings menu should open via keyboard");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  assert(
    await settingsTrigger.evaluate((element) => element === document.activeElement),
    "Focus should return to the settings menu trigger after Escape",
  );

  const userTrigger = page.getByTestId("button-user-menu");
  await userTrigger.focus();
  assert(
    await userTrigger.evaluate((element) => element === document.activeElement),
    "User menu trigger should be focusable from the keyboard",
  );
  await page.keyboard.press("Enter");
  await page.getByRole("menuitemradio", { name: "Light Mode" }).waitFor();
  assert(await userTrigger.getAttribute("aria-expanded") === "true", "User menu should open via keyboard");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  assert(
    await userTrigger.evaluate((element) => element === document.activeElement),
    "Focus should return to the user menu trigger after Escape",
  );

  tracker.assertClean("keyboard menu access");
  tracker.clear();
};

const checkUserMenuThemeMode = async (page, tracker) => {
  await openUserMenu(page);

  await page.getByRole("menuitemradio", { name: "Light Mode" }).waitFor();
  await page.getByRole("menuitemradio", { name: "Dark Mode" }).waitFor();
  await page.getByRole("menuitemradio", { name: "Dark Mode" }).click();

  let themeState = await page.evaluate(() => ({
    isDark: document.documentElement.classList.contains("dark"),
    storedTheme: localStorage.getItem("theme"),
  }));

  assert(themeState.isDark, "Dark mode should apply document dark class");
  assert(themeState.storedTheme === "dark", "Dark mode should persist in localStorage");

  await openUserMenu(page);
  await page.getByRole("menuitemradio", { name: "Light Mode" }).click();

  themeState = await page.evaluate(() => ({
    isDark: document.documentElement.classList.contains("dark"),
    storedTheme: localStorage.getItem("theme"),
  }));

  assert(!themeState.isDark, "Light mode should remove document dark class");
  assert(themeState.storedTheme === "light", "Light mode should persist in localStorage");

  tracker.assertClean("user menu theme toggle");
  tracker.clear();

  await closeMenus(page);
};

const checkMobileNavbar = async (page, tracker) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Open navigation menu" }).waitFor();
  await page.locator('button[aria-label="Open navigation menu"]').click();
  await page.getByRole("menuitem", { name: "Home" }).waitFor();
  await page.getByRole("menuitem", { name: /Backup & Restore/i }).waitFor();

  tracker.assertClean("mobile navbar");
  tracker.clear();

  await closeMenus(page);
};

const checkHomeEntryPoint = async (page, tracker) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle" });
  await page.getByRole("navigation", { name: "Settings Navigation" }).waitFor();
  await page.getByTestId("nav-home").click();
  await page.waitForLoadState("networkidle");
  await page.waitForURL(/\/$/);
  await page.getByRole("heading", { name: "Welcome" }).waitFor();
  await page.getByTestId("card-general-search").waitFor();

  tracker.assertClean("home entry point");
  tracker.clear();
};

const checkCollectionDailyPage = async (page, tracker) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/collection/daily`, { waitUntil: "networkidle" });
  await page.getByTestId("collection-daily-page").waitFor();
  await page.getByTestId("collection-daily-title").waitFor();
  await page.getByTestId("collection-daily-legend").waitFor();
  await page.getByTestId("collection-daily-calendar").waitFor();

  const summaryCount = await page.getByTestId("collection-daily-summary").count();
  assert(summaryCount <= 1, "Collection Daily summary container should render at most once");

  const userTriggerCount = await page.getByTestId("collection-daily-user-trigger").count();
  if (userTriggerCount > 0) {
    const userTrigger = page.getByTestId("collection-daily-user-trigger");
    await userTrigger.waitFor();
    await userTrigger.click();
    const userPopover = page.getByTestId("collection-daily-user-popover");
    await userPopover.waitFor();
    await page.getByRole("button", { name: "Clear" }).waitFor();
    await page.getByRole("button", { name: "Clear" }).click();

    const userRows = userPopover.locator("label");
    const userCount = await userRows.count();
    if (userCount > 0) {
      assert(
        (await userTrigger.innerText()).includes("Select users"),
        "Collection Daily user trigger should show empty state after clearing selection",
      );

      await userRows.first().click();
      if (userCount > 1) {
        await userRows.nth(1).click();
        await page.waitForTimeout(100);
        assert(
          (await userTrigger.innerText()).includes("2 users selected"),
          "Collection Daily should reflect multi-user selection in the trigger label",
        );
      }

      await page.getByText("Select all users").click();
      await page.waitForTimeout(100);
      if (userCount > 1) {
        const selectedAllLabel = await userTrigger.innerText();
        assert(
          selectedAllLabel.includes("users selected") && !selectedAllLabel.includes("Select users"),
          "Collection Daily should reflect a non-empty multi-user state after select-all",
        );
      }
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }

  const firstDayCell = page.locator('[data-testid^="collection-daily-day-"]').first();
  if (await firstDayCell.count()) {
    await firstDayCell.click();
    await page.getByTestId("collection-daily-day-dialog").waitFor();

    const dayDialog = page.getByTestId("collection-daily-day-dialog");
    const receiptButtons = dayDialog
      .locator('button')
      .filter({ hasText: /View Receipt|\.pdf|\.png|\.jpg|\.jpeg/i });
    const receiptButtonCount = await receiptButtons.count();

    if (receiptButtonCount > 0) {
      const receiptTrigger = receiptButtons.first();
      for (let cycle = 1; cycle <= 2; cycle += 1) {
        await receiptTrigger.click();
        await page.getByRole("heading", { name: "Receipt Preview" }).waitFor();
        await page.getByRole("button", { name: "Close" }).waitFor();
        await page.getByRole("button", { name: "Close" }).click();
        await page.waitForTimeout(100);
        assert(
          await page.getByRole("heading", { name: "Receipt Preview" }).count() === 0,
          `Receipt preview should fully close after cycle ${cycle}`,
        );
      }
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }

  tracker.assertClean("collection daily page");
  tracker.clear();
};

const readCookieNames = async (context) =>
  new Set((await context.cookies(baseUrl)).map((cookie) => cookie.name));

const waitForAuthCookies = async (context, timeoutMs = 5_000) => {
  const startedAt = Date.now();
  let cookieNames = await readCookieNames(context);

  while (
    Date.now() - startedAt < timeoutMs
    && (!cookieNames.has("sqr_auth") || !cookieNames.has("sqr_auth_hint"))
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    cookieNames = await readCookieNames(context);
  }

  return cookieNames;
};

const waitForClearedAuthCookies = async (context, timeoutMs = 5_000) => {
  const startedAt = Date.now();
  let cookieNames = await readCookieNames(context);

  while (
    Date.now() - startedAt < timeoutMs
    && (cookieNames.has("sqr_auth") || cookieNames.has("sqr_auth_hint"))
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    cookieNames = await readCookieNames(context);
  }

  return cookieNames;
};

const probeAuthSession = async (page) =>
  page.evaluate(async () => {
    const response = await fetch("/api/me", { credentials: "include" });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      hasUser: Boolean(payload?.user),
      message: payload?.message || null,
    };
  });

const checkLogoutFlow = async (page, context, tracker) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForLoadState("networkidle");
  await openUserMenu(page);
  await page.getByTestId("button-logout").click();
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('text="Log In SQR System"');

  const cookieNames = await waitForClearedAuthCookies(context);
  assert(!cookieNames.has("sqr_auth"), "auth session cookie should be cleared after logout");
  assert(!cookieNames.has("sqr_auth_hint"), "auth session hint cookie should be cleared after logout");

  const loggedOutState = await page.evaluate(() => ({
    storedUser: localStorage.getItem("user"),
    storedUsername: localStorage.getItem("username"),
    storedRole: localStorage.getItem("role"),
  }));
  assert(loggedOutState.storedUser === null, "stored user should be cleared after logout");
  assert(loggedOutState.storedUsername === null, "stored username should be cleared after logout");
  assert(loggedOutState.storedRole === null, "stored role should be cleared after logout");

  tracker.assertClean("logout");
  tracker.clear();
};

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
      const loginResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST"
          && response.url().includes("/api/login"),
      );

      await page.getByPlaceholder("Username").fill(username);
      await page.getByPlaceholder("Password").fill(password);
      await page.getByRole("button", { name: "Log In" }).click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(250);
      const loginResponse = await loginResponsePromise;
      let loginPayload = null;
      try {
        loginPayload = await loginResponse.json();
      } catch {
        loginPayload = null;
      }

      const cookieNames = await waitForAuthCookies(context);
      const authProbe = await probeAuthSession(page);
      assert(
        authProbe.ok && authProbe.hasUser,
        [
          "Login should establish an authenticated session.",
          `POST /api/login status: ${loginResponse.status()}`,
          `POST /api/login message: ${String(loginPayload?.message || "(none)")}`,
          `GET /api/me status: ${authProbe.status}`,
          `GET /api/me message: ${String(authProbe.message || "(none)")}`,
          `Cookies seen after login: ${Array.from(cookieNames).join(", ") || "(none)"}`,
        ].join("\n"),
      );

      const bodyText = (await page.locator("body").innerText()).toLowerCase();
      assert(!bodyText.includes("log in sqr system"), "login page should be replaced after successful login");
      tracker.assertClean("login");
      tracker.clear();

      await checkDesktopNavbar(page, tracker);
      await checkKeyboardMenuAccess(page, tracker);
      await checkUserMenuThemeMode(page, tracker);
      await checkMobileNavbar(page, tracker);
      await checkHomeEntryPoint(page, tracker);
      await checkCollectionDailyPage(page, tracker);

      await checkLogoutFlow(page, context, tracker);
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
