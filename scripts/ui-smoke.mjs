import process from "node:process";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";
const username = process.env.SMOKE_TEST_USERNAME || "";
const password = process.env.SMOKE_TEST_PASSWORD || "";
const rawArtifactsDir = String(process.env.SMOKE_ARTIFACTS_DIR || "").trim();
const artifactsDir = rawArtifactsDir ? path.resolve(process.cwd(), rawArtifactsDir) : "";
const errors = [];

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

const captureFailureArtifacts = async ({ context, page, tracker, error }) => {
  if (!artifactsDir) {
    return;
  }

  await ensureArtifactsDir();

  const failureScreenshotPath = path.join(artifactsDir, "failure.png");
  const failureStatePath = path.join(artifactsDir, "failure-state.json");
  const failureHtmlPath = path.join(artifactsDir, "failure-page.html");

  await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  const pageHtml = await page.content().catch(() => "");
  if (pageHtml) {
    await writeFile(failureHtmlPath, pageHtml, "utf8").catch(() => {});
  }

  const cookies = await context.cookies(baseUrl).catch(() => []);
  const message = error instanceof Error ? error.stack || error.message : String(error);
  const failureState = {
    baseUrl,
    url: page.url(),
    message,
    failedRequests: tracker.failedRequests,
    consoleMessages: tracker.consoleMessages,
    cookies,
  };

  await writeFile(
    failureStatePath,
    JSON.stringify(failureState, null, 2),
    "utf8",
  ).catch(() => {});
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
  const baseOrigin = new URL(baseUrl).origin;

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
          const text = message.text();
          if (/^Failed to load resource: the server responded with a status of \d{3}/.test(text)) {
            return;
          }
          consoleMessages.push(`[${type}] ${text}`);
        }
      });

      page.on("response", (response) => {
        const url = response.url();
        if (
          response.status() >= 400
          && (url.startsWith(baseOrigin) || url.startsWith("/"))
        ) {
          failedRequests.push(
            `${response.request().method()} ${url} :: ${response.status()}`,
          );
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
    const clearButton = userPopover.getByRole("button", { name: "Clear" });
    const noUsersMessage = userPopover.getByText(/No staff nicknames available\./i);

    let hasReadyState = false;
    const startedAt = Date.now();
    while (!hasReadyState && Date.now() - startedAt < 10_000) {
      const clearVisible = await clearButton.isVisible().catch(() => false);
      const noUsersVisible = await noUsersMessage.isVisible().catch(() => false);
      hasReadyState = clearVisible || noUsersVisible;
      if (!hasReadyState) {
        await page.waitForTimeout(100);
      }
    }

    assert(
      hasReadyState,
      "Collection Daily user popover did not resolve to a ready state (user list or empty message)",
    );

    const canClearSelection = await clearButton.isVisible().catch(() => false);
    if (canClearSelection) {
      await clearButton.click();
    }

    const userRows = userPopover.locator("label");
    const userCount = await userRows.count();
    if (canClearSelection && userCount > 0) {
      const emptySelectionPattern = /Select (users|staff nicknames)/i;
      const multiSelectionPattern = /(\d+)\s+(users|staff nicknames)\s+selected/i;
      assert(
        emptySelectionPattern.test(await userTrigger.innerText()),
        "Collection Daily user trigger should show empty state after clearing selection",
      );

      await userRows.first().click();
      if (userCount > 1) {
        await userRows.nth(1).click();
        await page.waitForTimeout(100);
        assert(
          /2\s+(users|staff nicknames)\s+selected/i.test(await userTrigger.innerText()),
          "Collection Daily should reflect multi-user selection in the trigger label",
        );
      }

      await page.getByText(/Select all (users|staff nicknames)/i).click();
      await page.waitForTimeout(100);
      if (userCount > 1) {
        const selectedAllLabel = await userTrigger.innerText();
        assert(
          multiSelectionPattern.test(selectedAllLabel) && !emptySelectionPattern.test(selectedAllLabel),
          "Collection Daily should reflect a non-empty multi-user state after select-all",
        );
      }
    } else if (userCount === 0) {
      assert(
        await noUsersMessage.isVisible().catch(() => false),
        "Collection Daily popover has no user rows but did not show the expected empty-state message",
      );
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

const checkCollectionRecordsStaleDeleteConflict = async (page, context, tracker) => {
  const smokeRecord = await provisionStaleDeleteConflictRecord(context);
  let cleanupVersion = smokeRecord.expectedUpdatedAt;

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/collection/records`, { waitUntil: "networkidle" });
    await page.getByText("View Rekod Collection").first().waitFor();

    const searchInput = page.getByPlaceholder("Cari nama / IC / akaun / batch / telefon / jumlah bayaran");
    await searchInput.fill(smokeRecord.customerName);
    await page.getByRole("button", { name: "Filter" }).click();
    await page.waitForLoadState("networkidle");

    const targetRow = page.locator("tr", { hasText: smokeRecord.customerName }).first();
    await targetRow.waitFor({ state: "visible", timeout: 20_000 });
    await targetRow.getByRole("button", { name: "Delete" }).click();

    await page.getByText("Adakah anda pasti mahu padam rekod collection ini?").waitFor({ timeout: 15_000 });

    const mutationResponse = await apiJsonRequest(
      context,
      "PATCH",
      `/api/collection/${encodeURIComponent(smokeRecord.id)}`,
      {
        amount: smokeRecord.bumpedAmount,
        expectedUpdatedAt: smokeRecord.expectedUpdatedAt,
      },
      [200],
    );
    const updatedRecord = mutationResponse.payload?.record;
    cleanupVersion = String(updatedRecord?.updatedAt || updatedRecord?.createdAt || cleanupVersion || "");
    assert(cleanupVersion, "stale-delete smoke should capture the updated version timestamp for cleanup");

    await page.getByRole("button", { name: "Padam" }).click();
    let consumedConflicts = 0;
    const conflictDeadline = Date.now() + 15_000;
    while (Date.now() < conflictDeadline && consumedConflicts < 1) {
      consumedConflicts += consumeExpectedCollectionDeleteConflict(tracker, smokeRecord.id);
      if (consumedConflicts > 0) {
        break;
      }
      await page.waitForTimeout(100);
    }
    assert(
      consumedConflicts >= 1,
      `Expected at least one 409 DELETE /api/collection/${smokeRecord.id} response during stale-delete smoke flow`,
    );
    await targetRow.waitFor({ state: "visible", timeout: 15_000 });

    // A 429 from purge-summary is non-critical here and can replace the conflict toast due TOAST_LIMIT=1.
    consumeExpectedCollectionPurgeSummaryRateLimit(tracker);
    tracker.assertClean("collection records stale-delete conflict");
    tracker.clear();
  } finally {
    await cleanupStaleDeleteConflictRecord(context, {
      ...smokeRecord,
      expectedUpdatedAt: cleanupVersion,
    });
  }
};

const isLiveCookie = (cookie) => {
  if (!cookie || typeof cookie.name !== "string") {
    return false;
  }

  const value = String(cookie.value || "");
  if (value.length === 0) {
    return false;
  }

  const expires = Number(cookie.expires);
  return expires === -1 || expires * 1000 > Date.now();
};

const readCookieNames = async (context) =>
  new Set(
    (await context.cookies(baseUrl))
      .filter(isLiveCookie)
      .map((cookie) => cookie.name),
  );

const readLiveCookies = async (context) =>
  (await context.cookies(baseUrl)).filter(isLiveCookie);

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

const getLocalIsoDate = (referenceDate = new Date()) =>
  `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}-${String(referenceDate.getDate()).padStart(2, "0")}`;

const readCsrfToken = async (context) => {
  const csrfCookie = (await context.cookies(baseUrl))
    .find((cookie) => cookie.name === "sqr_csrf" && isLiveCookie(cookie));
  return String(csrfCookie?.value || "");
};

const apiJsonRequest = async (context, method, apiPath, body, expectedStatuses = [200]) => {
  const uppercaseMethod = String(method || "").toUpperCase();
  const headers = {
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(uppercaseMethod)) {
    const csrfToken = await readCsrfToken(context);
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const response = await context.request.fetch(`${baseUrl}${apiPath}`, {
    method: uppercaseMethod,
    headers,
    data: body,
    failOnStatusCode: false,
  });

  const status = response.status();
  const rawText = await response.text();
  let payload = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  if (!expectedStatuses.includes(status)) {
    throw new Error(
      [
        `${uppercaseMethod} ${apiPath} returned unexpected status ${status}.`,
        `Expected statuses: ${expectedStatuses.join(", ")}`,
        `Response body: ${rawText || "(empty)"}`,
      ].join("\n"),
    );
  }

  return { status, payload };
};

const provisionStaleDeleteConflictRecord = async (context) => {
  const nicknamesResponse = await apiJsonRequest(
    context,
    "GET",
    "/api/collection/nicknames?includeInactive=1",
    undefined,
    [200],
  );
  const nicknames = Array.isArray(nicknamesResponse.payload?.nicknames)
    ? nicknamesResponse.payload.nicknames
    : [];
  const activeNickname = nicknames.find((nickname) => nickname?.isActive === true);
  let targetNickname = String(activeNickname?.nickname || "").trim();

  if (!targetNickname) {
    const generatedNickname = `Smoke Conflict ${Date.now()}`;
    const createNicknameResponse = await apiJsonRequest(
      context,
      "POST",
      "/api/collection/nicknames",
      {
        nickname: generatedNickname,
        roleScope: "both",
      },
      [200],
    );
    targetNickname = String(createNicknameResponse.payload?.nickname?.nickname || "").trim();
  }
  assert(targetNickname, "stale-delete smoke requires at least one active collection nickname");

  const uniqueSuffix = String(Date.now());
  const customerName = `Smoke Stale Delete ${uniqueSuffix}`;
  const accountNumber = `SMK-${uniqueSuffix}`;
  const createRecordResponse = await apiJsonRequest(
    context,
    "POST",
    "/api/collection",
    {
      customerName,
      icNumber: `900101${uniqueSuffix.slice(-6)}`,
      customerPhone: `012${uniqueSuffix.slice(-7)}`,
      accountNumber,
      batch: "P10",
      paymentDate: getLocalIsoDate(),
      amount: 55.3,
      collectionStaffNickname: targetNickname,
    },
    [200],
  );

  const createdRecord = createRecordResponse.payload?.record;
  const id = String(createdRecord?.id || "");
  const expectedUpdatedAt = String(createdRecord?.updatedAt || createdRecord?.createdAt || "");
  assert(id, "stale-delete smoke should receive a record id from create API");
  assert(expectedUpdatedAt, "stale-delete smoke should receive a record version timestamp from create API");

  return {
    id,
    customerName,
    accountNumber,
    expectedUpdatedAt,
    bumpedAmount: 77.7,
  };
};

const waitForRateLimitRecovery = async (payload, fallbackMs = 1_000) => {
  const retryAfterMs = Number(payload?.retryAfterMs);
  const boundedRetryMs = Number.isFinite(retryAfterMs)
    ? Math.min(8_000, Math.max(250, retryAfterMs))
    : fallbackMs;
  await new Promise((resolve) => setTimeout(resolve, boundedRetryMs));
};

const cleanupStaleDeleteConflictRecord = async (
  context,
  record,
) => {
  let expectedUpdatedAt = String(record.expectedUpdatedAt || "");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const deleteResponse = await apiJsonRequest(
      context,
      "DELETE",
      `/api/collection/${encodeURIComponent(record.id)}`,
      expectedUpdatedAt ? { expectedUpdatedAt } : undefined,
      [200, 404, 409, 429],
    );
    if (deleteResponse.status === 429) {
      await waitForRateLimitRecovery(deleteResponse.payload, 1_000);
      continue;
    }
    if (deleteResponse.status === 200 || deleteResponse.status === 404) {
      return;
    }

    const listResponse = await apiJsonRequest(
      context,
      "GET",
      `/api/collection/list?search=${encodeURIComponent(record.accountNumber)}&limit=100&offset=0`,
      undefined,
      [200, 429],
    );
    if (listResponse.status === 429) {
      await waitForRateLimitRecovery(listResponse.payload, 1_000);
      continue;
    }
    const rows = Array.isArray(listResponse.payload?.records) ? listResponse.payload.records : [];
    const matched = rows.find((item) => String(item?.id || "") === record.id);
    const refreshedVersion = String(matched?.updatedAt || matched?.createdAt || "");
    if (!refreshedVersion) {
      return;
    }
    expectedUpdatedAt = refreshedVersion;
  }

  throw new Error(`stale-delete smoke cleanup could not delete record ${record.id}`);
};

const consumeExpectedCollectionDeleteConflict = (tracker, recordId) => {
  const pattern = `/api/collection/${recordId}`;
  let consumed = 0;
  for (let index = tracker.failedRequests.length - 1; index >= 0; index -= 1) {
    const entry = String(tracker.failedRequests[index] || "");
    if (entry.includes("DELETE") && entry.includes(pattern) && entry.includes(":: 409")) {
      tracker.failedRequests.splice(index, 1);
      consumed += 1;
    }
  }
  return consumed;
};

const consumeExpectedCollectionPurgeSummaryRateLimit = (tracker) => {
  const pattern = "/api/collection/purge-summary";
  let consumed = 0;
  for (let index = tracker.failedRequests.length - 1; index >= 0; index -= 1) {
    const entry = String(tracker.failedRequests[index] || "");
    if (entry.includes("GET") && entry.includes(pattern) && entry.includes(":: 429")) {
      tracker.failedRequests.splice(index, 1);
      consumed += 1;
    }
  }
  return consumed;
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
  // Ignore stale request noise from prior smoke sections; this assertion scopes logout only.
  tracker.clear();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByTestId("button-user-menu").waitFor();
  await page.waitForLoadState("networkidle");
  await openUserMenu(page);
  await page.getByTestId("button-logout").click();
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('text="Log In SQR System"');

  const cookieNames = await waitForClearedAuthCookies(context);
  if (cookieNames.has("sqr_auth") || cookieNames.has("sqr_auth_hint")) {
    const liveCookies = await readLiveCookies(context);
    const authProbe = await probeAuthSession(page);
    throw new Error([
      "auth session cookie should be cleared after logout",
      `Live cookies after logout: ${JSON.stringify(liveCookies)}`,
      `GET /api/me after logout: ${JSON.stringify(authProbe)}`,
      `localStorage.activityId after logout: ${JSON.stringify(await page.evaluate(() => localStorage.getItem("activityId")))}`,
    ].join("\n"));
  }

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
  let traceStarted = false;
  let shouldSaveTrace = false;
  tracker.attach(page);

  if (artifactsDir) {
    await ensureArtifactsDir();
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    traceStarted = true;
  }

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
      await checkCollectionRecordsStaleDeleteConflict(page, context, tracker);

      await checkLogoutFlow(page, context, tracker);
    } else {
      console.log(
        "Skipping authenticated smoke navigation because SMOKE_TEST_USERNAME and SMOKE_TEST_PASSWORD are not set.",
      );
    }
  } catch (error) {
    shouldSaveTrace = Boolean(artifactsDir);
    await captureFailureArtifacts({ context, page, tracker, error }).catch(() => {});
    throw error;
  } finally {
    if (traceStarted) {
      if (shouldSaveTrace && artifactsDir) {
        const tracePath = path.join(artifactsDir, "trace.zip");
        await context.tracing.stop({ path: tracePath }).catch(() => {});
      } else {
        await context.tracing.stop().catch(() => {});
      }
    }
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
