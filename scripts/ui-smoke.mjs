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
        const closeButton = page
          .getByRole("dialog")
          .locator("button")
          .filter({ hasText: /^Close$/ })
          .first();
        await closeButton.waitFor();
        await closeButton.click();
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

const ensureCollectionSmokeNicknames = async (context) => {
  const nicknamesResponse = await apiJsonRequestWithRetry(
    context,
    "GET",
    "/api/collection/nicknames?includeInactive=1",
    undefined,
    [200],
  );
  const rows = Array.isArray(nicknamesResponse.payload?.nicknames)
    ? nicknamesResponse.payload.nicknames
    : [];
  const activeNicknames = rows
    .filter((item) => item?.isActive === true)
    .map((item) => String(item?.nickname || "").trim())
    .filter(Boolean);

  const selected = Array.from(new Set(activeNicknames));
  while (selected.length < 2) {
    const generatedNickname = `Smoke Collector ${Date.now()}-${selected.length + 1}`;
    const createResponse = await apiJsonRequestWithRetry(
      context,
      "POST",
      "/api/collection/nicknames",
      {
        nickname: generatedNickname,
        roleScope: "both",
      },
      [200],
    );
    const createdNickname = String(createResponse.payload?.nickname?.nickname || "").trim();
    if (createdNickname) {
      selected.push(createdNickname);
    }
  }

  return selected.slice(0, 2);
};

const smokeFixtureDir = artifactsDir
  ? path.join(artifactsDir, "_fixtures")
  : path.resolve(process.cwd(), "var", "smoke-ui-fixtures");

const createSmokeReceiptPngBuffer = () =>
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lmioAAAAASUVORK5CYII=",
    "base64",
  );

const ensureCollectionSmokeAsset = async (fileName) => {
  const normalizedName = String(fileName || "").trim();
  assert(normalizedName, "collection smoke asset file name is required");

  await mkdir(smokeFixtureDir, { recursive: true });
  const filePath = path.join(smokeFixtureDir, normalizedName);
  await writeFile(filePath, createSmokeReceiptPngBuffer());
  return filePath;
};

const getInputByLabel = (page, labelText) =>
  page
    .locator("label", { hasText: labelText })
    .locator("xpath=..")
    .locator("input")
    .first();

const applySmokeCollectionNicknameSession = async (page, nickname) => {
  await page.evaluate((staffNickname) => {
    let username = String(localStorage.getItem("username") || "").trim().toLowerCase();
    let role = String(localStorage.getItem("role") || "user").trim().toLowerCase();

    try {
      const rawUser = localStorage.getItem("user");
      const parsedUser = rawUser ? JSON.parse(rawUser) : null;
      username = String(parsedUser?.username || username).trim().toLowerCase();
      role = String(parsedUser?.role || role).trim().toLowerCase();
    } catch {
      // Ignore stale localStorage shape differences during smoke.
    }

    sessionStorage.setItem("collection_staff_nickname", staffNickname);
    sessionStorage.setItem(
      "collection_staff_nickname_auth",
      JSON.stringify({
        nickname: staffNickname,
        username,
        role,
        verifiedAt: Date.now(),
      }),
    );
  }, nickname);
};

const filterCollectionRecordsBySearch = async (page, searchValue) => {
  const searchInput = page.getByPlaceholder("Cari nama / IC / akaun / batch / telefon / jumlah bayaran");
  await searchInput.fill(searchValue);
  await page.getByRole("button", { name: "Filter" }).click();
  const targetRow = page.locator("tr", { hasText: searchValue }).first();
  await targetRow.waitFor({ state: "visible", timeout: 20_000 });
  return targetRow;
};

const closeReceiptPreviewDialog = async (page) => {
  const previewHeading = page.getByRole("heading", { name: "Receipt Preview" });
  await previewHeading.waitFor({ timeout: 15_000 });
  await page
    .getByRole("dialog")
    .locator("button")
    .filter({ hasText: /^Close$/ })
    .first()
    .click();
  await previewHeading.waitFor({ state: "hidden", timeout: 15_000 });
};

const cleanupCollectionReceiptSmokeRecord = async (context, {
  recordId,
  accountNumber,
  expectedUpdatedAt,
}) => {
  let targetRecordId = String(recordId || "").trim();
  let targetVersion = String(expectedUpdatedAt || "").trim();

  if (!targetRecordId && accountNumber) {
    const params = new URLSearchParams();
    params.set("search", accountNumber);
    params.set("limit", "10");
    const listResponse = await apiJsonRequestWithRetry(
      context,
      "GET",
      `/api/collection/list?${params.toString()}`,
      undefined,
      [200],
    );
    const records = Array.isArray(listResponse.payload?.records)
      ? listResponse.payload.records
      : [];
    const matchedRecord = records.find(
      (record) => String(record?.accountNumber || "").trim() === accountNumber,
    );
    if (matchedRecord) {
      targetRecordId = String(matchedRecord.id || "").trim();
      targetVersion = String(
        matchedRecord.updatedAt || matchedRecord.createdAt || targetVersion || "",
      ).trim();
    }
  }

  if (!targetRecordId) {
    return;
  }

  await apiJsonRequest(
    context,
    "DELETE",
    `/api/collection/${encodeURIComponent(targetRecordId)}`,
    targetVersion ? { expectedUpdatedAt: targetVersion } : undefined,
    [200, 404],
  );
};

const cleanupBackupByName = async (context, backupName) => {
  const normalizedName = String(backupName || "").trim();
  if (!normalizedName) {
    return;
  }

  const params = new URLSearchParams();
  params.set("searchName", normalizedName);
  params.set("pageSize", "25");
  const listResponse = await apiJsonRequestWithRetry(
    context,
    "GET",
    `/api/backups?${params.toString()}`,
    undefined,
    [200],
  );
  const backups = Array.isArray(listResponse.payload?.backups)
    ? listResponse.payload.backups
    : [];

  for (const backup of backups) {
    if (String(backup?.name || "").trim() !== normalizedName) {
      continue;
    }

    await apiJsonRequest(
      context,
      "DELETE",
      `/api/backups/${encodeURIComponent(String(backup.id || "").trim())}`,
      undefined,
      [200, 404],
    );
  }
};

const checkCollectionReceiptUiFlow = async (page, context, tracker) => {
  const [nickname] = await ensureCollectionSmokeNicknames(context);
  const uniqueSuffix = `${Date.now()}`;
  const customerName = `Smoke Receipt ${uniqueSuffix}`;
  const accountNumber = `SMOKE-RCPT-${uniqueSuffix}`;
  const saveReceiptName = "receipt-smoke-save.png";
  const replaceReceiptName = "receipt-replace.png";
  const saveReceiptPath = await ensureCollectionSmokeAsset(saveReceiptName);
  const replaceReceiptPath = await ensureCollectionSmokeAsset(replaceReceiptName);
  let recordId = "";
  let expectedUpdatedAt = "";
  let recordDeleted = false;

  try {
    await applySmokeCollectionNicknameSession(page, nickname);
    await page.goto(`${baseUrl}/collection/save`, { waitUntil: "networkidle" });
    await page.getByText("Simpan Collection Individual").first().waitFor();

    await getInputByLabel(page, "Customer Name").fill(customerName);
    await getInputByLabel(page, "IC Number").fill(`900101${uniqueSuffix.slice(-6)}`);
    await getInputByLabel(page, "Customer Phone Number").fill(`012${uniqueSuffix.slice(-7)}`);
    await getInputByLabel(page, "Account Number").fill(accountNumber);
    await getInputByLabel(page, "Payment Date").fill(getLocalIsoDate());
    await getInputByLabel(page, "Amount (RM)").fill("12.34");
    await page.locator('input[type="file"]').setInputFiles(saveReceiptPath);
    await page.getByText(saveReceiptName).first().waitFor({ timeout: 15_000 });

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST"
        && response.url().includes("/api/collection")
        && response.status() === 200,
    );
    await page.getByRole("button", { name: "Save Collection" }).click();
    const createResponse = await createResponsePromise;
    const createPayload = await createResponse.json();
    recordId = String(createPayload?.record?.id || "").trim();
    expectedUpdatedAt = String(
      createPayload?.record?.updatedAt || createPayload?.record?.createdAt || "",
    ).trim();
    assert(recordId, "collection receipt UI smoke should receive a created record id");
    assert(expectedUpdatedAt, "collection receipt UI smoke should capture the created record version");
    await page.waitForTimeout(250);

    await page.goto(`${baseUrl}/collection/records`, { waitUntil: "networkidle" });
    await page.getByText("View Rekod Collection").first().waitFor();
    let targetRow = await filterCollectionRecordsBySearch(page, accountNumber);

    await targetRow.getByRole("button", { name: /View/ }).click();
    await page.getByText(saveReceiptName).first().waitFor({ timeout: 15_000 });
    await closeReceiptPreviewDialog(page);

    await targetRow.getByRole("button", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "Edit Collection Record" }),
    }).first();
    await editDialog.waitFor({ timeout: 15_000 });
    await editDialog.getByText(saveReceiptName).first().waitFor({ timeout: 15_000 });
    await editDialog.getByRole("button", { name: "Remove" }).first().click();
    await editDialog.locator('input[type="file"]').setInputFiles(replaceReceiptPath);
    await editDialog.getByText(replaceReceiptName).first().waitFor({ timeout: 15_000 });
    await editDialog.getByText("Replacement Pending").first().waitFor({ timeout: 15_000 });

    const updateResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH"
        && response.url().includes(`/api/collection/${recordId}`)
        && response.status() === 200,
    );
    await editDialog.getByRole("button", { name: /^Save$/ }).click();
    const firstUpdateResponse = await updateResponsePromise;
    const firstUpdatePayload = await firstUpdateResponse.json();
    expectedUpdatedAt = String(
      firstUpdatePayload?.record?.updatedAt || firstUpdatePayload?.record?.createdAt || expectedUpdatedAt,
    ).trim();
    await editDialog.waitFor({ state: "hidden", timeout: 15_000 });

    targetRow = await filterCollectionRecordsBySearch(page, accountNumber);
    await targetRow.getByRole("button", { name: /View/ }).click();
    await page.getByText(replaceReceiptName).first().waitFor({ timeout: 15_000 });
    await closeReceiptPreviewDialog(page);

    await targetRow.getByRole("button", { name: "Edit" }).click();
    const removeDialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "Edit Collection Record" }),
    }).first();
    await removeDialog.waitFor({ timeout: 15_000 });
    await removeDialog.getByText(replaceReceiptName).first().waitFor({ timeout: 15_000 });
    await removeDialog.getByRole("button", { name: "Remove" }).first().click();

    const removeResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH"
        && response.url().includes(`/api/collection/${recordId}`)
        && response.status() === 200,
    );
    await removeDialog.getByRole("button", { name: /^Save$/ }).click();
    const removeResponse = await removeResponsePromise;
    const removePayload = await removeResponse.json();
    expectedUpdatedAt = String(
      removePayload?.record?.updatedAt || removePayload?.record?.createdAt || expectedUpdatedAt,
    ).trim();
    await removeDialog.waitFor({ state: "hidden", timeout: 15_000 });

    await page.waitForTimeout(1_500);
    const postRemoveParams = new URLSearchParams();
    postRemoveParams.set("search", accountNumber);
    postRemoveParams.set("limit", "10");
    const postRemoveResponse = await apiJsonRequestWithRetry(
      context,
      "GET",
      `/api/collection/list?${postRemoveParams.toString()}`,
      undefined,
      [200],
    );
    const postRemoveRecords = Array.isArray(postRemoveResponse.payload?.records)
      ? postRemoveResponse.payload.records
      : [];
    const postRemoveRecord = postRemoveRecords.find(
      (record) => String(record?.accountNumber || "").trim() === accountNumber,
    );
    assert(postRemoveRecord, "collection receipt UI smoke should still find the edited record after receipt removal");
    assert(
      Array.isArray(postRemoveRecord.receipts) && postRemoveRecord.receipts.length === 0,
      "collection receipt UI smoke should leave the record without any linked receipts after removal",
    );
    expectedUpdatedAt = String(
      postRemoveRecord.updatedAt || postRemoveRecord.createdAt || expectedUpdatedAt,
    ).trim();

    consumeExpectedCollectionPurgeSummaryRateLimit(tracker);
    consumeExpectedCollectionListRateLimit(tracker, accountNumber);
    tracker.assertClean("collection receipt UI flow");
    tracker.clear();
  } finally {
    if (!recordDeleted) {
      await cleanupCollectionReceiptSmokeRecord(context, {
        recordId,
        accountNumber,
        expectedUpdatedAt,
      }).catch(() => {});
    }
  }
};

const checkBackupRestoreUiFlow = async (page, context, tracker) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/settings?section=backup-restore`, { waitUntil: "networkidle" });
  await page.getByText("Backup & Restore").first().waitFor();

  if (await page.getByTestId("button-create-backup").count() === 0) {
    tracker.assertClean("backup restore UI flow");
    tracker.clear();
    return;
  }

  const backupName = `Smoke UI Backup ${Date.now()}`;
  let backupDeleted = false;

  try {
    await page.getByTestId("button-create-backup").click();
    await page.getByText("Create New Backup").first().waitFor({ timeout: 15_000 });
    await page.getByTestId("input-backup-name").fill(backupName);
    await page.getByTestId("button-confirm-create").click();

    const createdBackupItem = page
      .locator('[data-testid^="backup-item-"]')
      .filter({ hasText: backupName })
      .first();
    await createdBackupItem.waitFor({ state: "visible", timeout: 120_000 });

    await createdBackupItem.getByRole("button", { name: "Delete" }).click();
    await page.getByText("Delete Backup?").first().waitFor({ timeout: 15_000 });
    await page.getByTestId("button-confirm-delete").click();
    await createdBackupItem.waitFor({ state: "hidden", timeout: 60_000 });
    backupDeleted = true;

    tracker.assertClean("backup restore UI flow");
    tracker.clear();
  } finally {
    if (!backupDeleted) {
      await cleanupBackupByName(context, backupName).catch(() => {});
    }
  }
};

const fetchCollectionSummaryYear = async (context, year, nicknames) => {
  const params = new URLSearchParams();
  params.set("year", String(year));
  if (Array.isArray(nicknames) && nicknames.length > 0) {
    params.set("nicknames", nicknames.join(","));
  }
  const response = await apiJsonRequestWithRetry(
    context,
    "GET",
    `/api/collection/summary?${params.toString()}`,
    undefined,
    [200],
  );
  return response.payload;
};

const fetchNicknameSummary = async (context, { from, to, nicknames }) => {
  const params = new URLSearchParams();
  params.set("from", from);
  params.set("to", to);
  params.set("nicknames", nicknames.join(","));
  params.set("summaryOnly", "1");
  const response = await apiJsonRequestWithRetry(
    context,
    "GET",
    `/api/collection/nickname-summary?${params.toString()}`,
    undefined,
    [200],
  );
  return response.payload;
};

const fetchDailyOverview = async (context, { year, month, usernames }) => {
  const params = new URLSearchParams();
  params.set("year", String(year));
  params.set("month", String(month));
  params.set("usernames", usernames.join(","));
  const response = await apiJsonRequestWithRetry(
    context,
    "GET",
    `/api/collection/daily/overview?${params.toString()}`,
    undefined,
    [200],
  );
  return response.payload;
};

const checkCollectionMutationConsistency = async (context) => {
  const [nicknameA, nicknameB] = await ensureCollectionSmokeNicknames(context);
  assert(nicknameA && nicknameB, "collection mutation smoke requires two active nicknames");

  const now = new Date();
  const yearA = now.getFullYear();
  const monthA = now.getMonth() + 1;
  const monthB = monthA === 1 ? 12 : monthA - 1;
  const yearB = monthA === 1 ? yearA - 1 : yearA;
  const dateA = toIsoDate(yearA, monthA, Math.max(1, Math.min(now.getDate(), 10)));
  const dateB = toIsoDate(yearB, monthB, Math.min(15, getDaysInMonth(yearB, monthB)));
  const rangeFrom = toIsoDate(yearB, monthB, 1);
  const rangeTo = dateA;
  const scopedNicknames = [nicknameA, nicknameB];
  const initialAmount = 111.11;
  const bumpedAmount = 333.33;
  const monthlyTarget = 100000;

  const readMonthTotals = async () => {
    const summaryYearA = await fetchCollectionSummaryYear(context, yearA, scopedNicknames);
    const summaryYearB = yearA === yearB
      ? summaryYearA
      : await fetchCollectionSummaryYear(context, yearB, scopedNicknames);
    return {
      monthATotal: readMonthTotalAmount(summaryYearA, monthA),
      monthBTotal: readMonthTotalAmount(summaryYearB, monthB),
    };
  };

  const readNicknameTotals = async () => {
    const summary = await fetchNicknameSummary(context, {
      from: rangeFrom,
      to: rangeTo,
      nicknames: scopedNicknames,
    });
    return {
      nicknameATotal: readNicknameTotalAmount(summary, nicknameA),
      nicknameBTotal: readNicknameTotalAmount(summary, nicknameB),
    };
  };

  const baselineMonths = await readMonthTotals();
  const baselineNicknames = await readNicknameTotals();

  let createdRecordId = "";
  let createdAccountNumber = "";
  let expectedUpdatedAt = "";
  let recordDeleted = false;

  try {
    const uniqueSuffix = `${Date.now()}`;
    const createResponse = await apiJsonRequestWithRetry(
      context,
      "POST",
      "/api/collection",
      {
        customerName: `Smoke Mutation ${uniqueSuffix}`,
        icNumber: `900101${uniqueSuffix.slice(-6)}`,
        customerPhone: `012${uniqueSuffix.slice(-7)}`,
        accountNumber: `SMOKE-MUT-${uniqueSuffix}`,
        batch: "P10",
        paymentDate: dateA,
        amount: initialAmount,
        collectionStaffNickname: nicknameA,
      },
      [200],
    );
    const createdRecord = createResponse.payload?.record;
    createdRecordId = String(createdRecord?.id || "");
    createdAccountNumber = String(createdRecord?.accountNumber || `SMOKE-MUT-${uniqueSuffix}`);
    expectedUpdatedAt = String(createdRecord?.updatedAt || createdRecord?.createdAt || "");
    assert(createdRecordId, "collection mutation smoke should receive a created record id");
    assert(expectedUpdatedAt, "collection mutation smoke should receive a version timestamp from create API");

    const afterCreateMonths = await readMonthTotals();
    const afterCreateNicknames = await readNicknameTotals();
    assertMoneyClose(
      afterCreateMonths.monthATotal,
      baselineMonths.monthATotal + initialAmount,
      "Collection Summary month A total should increase after create",
    );
    assertMoneyClose(
      afterCreateNicknames.nicknameATotal,
      baselineNicknames.nicknameATotal + initialAmount,
      "Nickname Summary for staff A should increase after create",
    );

    const reassignResponse = await apiJsonRequestWithRetry(
      context,
      "PATCH",
      `/api/collection/${encodeURIComponent(createdRecordId)}`,
      {
        collectionStaffNickname: nicknameB,
        expectedUpdatedAt,
      },
      [200],
    );
    expectedUpdatedAt = String(
      reassignResponse.payload?.record?.updatedAt
      || reassignResponse.payload?.record?.createdAt
      || expectedUpdatedAt,
    );
    const afterReassignNicknames = await readNicknameTotals();
    assertMoneyClose(
      afterReassignNicknames.nicknameATotal,
      baselineNicknames.nicknameATotal,
      "Nickname Summary for staff A should decrease after reassignment",
    );
    assertMoneyClose(
      afterReassignNicknames.nicknameBTotal,
      baselineNicknames.nicknameBTotal + initialAmount,
      "Nickname Summary for staff B should increase after reassignment",
    );

    const moveDateResponse = await apiJsonRequestWithRetry(
      context,
      "PATCH",
      `/api/collection/${encodeURIComponent(createdRecordId)}`,
      {
        paymentDate: dateB,
        expectedUpdatedAt,
      },
      [200],
    );
    expectedUpdatedAt = String(
      moveDateResponse.payload?.record?.updatedAt
      || moveDateResponse.payload?.record?.createdAt
      || expectedUpdatedAt,
    );
    const afterDateMoveMonths = await readMonthTotals();
    assertMoneyClose(
      afterDateMoveMonths.monthATotal,
      baselineMonths.monthATotal,
      "Collection Summary month A total should decrease after payment-date month move",
    );
    assertMoneyClose(
      afterDateMoveMonths.monthBTotal,
      baselineMonths.monthBTotal + initialAmount,
      "Collection Summary month B total should increase after payment-date month move",
    );

    const amountUpdateResponse = await apiJsonRequestWithRetry(
      context,
      "PATCH",
      `/api/collection/${encodeURIComponent(createdRecordId)}`,
      {
        amount: bumpedAmount,
        expectedUpdatedAt,
      },
      [200],
    );
    expectedUpdatedAt = String(
      amountUpdateResponse.payload?.record?.updatedAt
      || amountUpdateResponse.payload?.record?.createdAt
      || expectedUpdatedAt,
    );
    const afterAmountMonths = await readMonthTotals();
    const afterAmountNicknames = await readNicknameTotals();
    assertMoneyClose(
      afterAmountMonths.monthBTotal,
      baselineMonths.monthBTotal + bumpedAmount,
      "Collection Summary month B total should reflect amount edit",
    );
    assertMoneyClose(
      afterAmountNicknames.nicknameBTotal,
      baselineNicknames.nicknameBTotal + bumpedAmount,
      "Nickname Summary for staff B should reflect amount edit",
    );

    await apiJsonRequestWithRetry(
      context,
      "PUT",
      "/api/collection/daily/target",
      {
        username: nicknameB,
        year: yearB,
        month: monthB,
        monthlyTarget,
      },
      [200],
    );
    const dailyOverview = await fetchDailyOverview(context, {
      year: yearB,
      month: monthB,
      usernames: [nicknameB],
    });
    const summary = dailyOverview?.summary || {};
    const collectedToDate = Number(summary.collectedToDate || 0);
    const expectedProgressAmount = Number(summary.expectedProgressAmount || 0);
    const remainingTarget = Number(summary.remainingTarget || 0);
    const remainingWorkingDays = Number(summary.remainingWorkingDays || 0);
    const requiredPerRemainingWorkingDay = Number(summary.requiredPerRemainingWorkingDay || 0);
    const boundedRemainingTarget = Math.max(0, monthlyTarget - collectedToDate);

    assert(
      expectedProgressAmount <= monthlyTarget + 0.01,
      `Daily expected progress must not exceed monthly target (${expectedProgressAmount} > ${monthlyTarget})`,
    );
    assertMoneyClose(
      remainingTarget,
      boundedRemainingTarget,
      "Daily remaining target should equal monthlyTarget - collectedToDate",
    );
    if (remainingWorkingDays > 0) {
      assertMoneyClose(
        requiredPerRemainingWorkingDay,
        boundedRemainingTarget / remainingWorkingDays,
        "Daily required per remaining working day should be mathematically consistent",
      );
    }

    const deleteResponse = await apiJsonRequestWithRetry(
      context,
      "DELETE",
      `/api/collection/${encodeURIComponent(createdRecordId)}`,
      expectedUpdatedAt ? { expectedUpdatedAt } : undefined,
      [200],
    );
    assert(deleteResponse.payload?.ok === true, "Delete flow should succeed in collection mutation smoke");
    recordDeleted = true;

    const finalMonths = await readMonthTotals();
    const finalNicknames = await readNicknameTotals();
    assertMoneyClose(
      finalMonths.monthATotal,
      baselineMonths.monthATotal,
      "Collection Summary month A should return to baseline after delete",
    );
    assertMoneyClose(
      finalMonths.monthBTotal,
      baselineMonths.monthBTotal,
      "Collection Summary month B should return to baseline after delete",
    );
    assertMoneyClose(
      finalNicknames.nicknameATotal,
      baselineNicknames.nicknameATotal,
      "Nickname Summary for staff A should return to baseline after delete",
    );
    assertMoneyClose(
      finalNicknames.nicknameBTotal,
      baselineNicknames.nicknameBTotal,
      "Nickname Summary for staff B should return to baseline after delete",
    );
  } finally {
    if (createdRecordId && !recordDeleted) {
      await cleanupStaleDeleteConflictRecord(context, {
        id: createdRecordId,
        accountNumber: createdAccountNumber,
        expectedUpdatedAt,
      }).catch(() => {});
    }
  }
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

const apiJsonRequestWithRetry = async (
  context,
  method,
  apiPath,
  body,
  expectedStatuses = [200],
  maxAttempts = 6,
) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await apiJsonRequest(
      context,
      method,
      apiPath,
      body,
      Array.from(new Set([...expectedStatuses, 429])),
    );

    if (response.status !== 429) {
      return response;
    }

    if (attempt === maxAttempts) {
      break;
    }
    await waitForRateLimitRecovery(response.payload, 800);
  }

  throw new Error(`${String(method).toUpperCase()} ${apiPath} remained rate-limited after ${maxAttempts} attempts.`);
};

const pad2 = (value) => String(value).padStart(2, "0");

const toIsoDate = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

const getDaysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const readMonthTotalAmount = (payload, month) => {
  const rows = Array.isArray(payload?.summary) ? payload.summary : [];
  const matched = rows.find((row) => Number(row?.month) === Number(month));
  return Number(matched?.totalAmount || 0);
};

const readNicknameTotalAmount = (payload, nickname) => {
  const rows = Array.isArray(payload?.nicknameTotals) ? payload.nicknameTotals : [];
  const normalized = String(nickname || "").trim().toLowerCase();
  const matched = rows.find((row) => String(row?.nickname || "").trim().toLowerCase() === normalized);
  return Number(matched?.totalAmount || 0);
};

const assertMoneyClose = (actual, expected, message) => {
  const actualValue = Number(actual || 0);
  const expectedValue = Number(expected || 0);
  const delta = Math.abs(actualValue - expectedValue);
  assert(
    delta <= 0.01,
    `${message}. Expected ${expectedValue.toFixed(2)}, got ${actualValue.toFixed(2)} (delta ${delta.toFixed(4)}).`,
  );
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

const consumeExpectedCollectionListRateLimit = (tracker, searchValue = "") => {
  const pattern = "/api/collection/list";
  const normalizedSearchValue = String(searchValue || "").trim();
  let consumed = 0;

  for (let index = tracker.failedRequests.length - 1; index >= 0; index -= 1) {
    const entry = String(tracker.failedRequests[index] || "");
    if (!entry.includes("GET") || !entry.includes(pattern) || !entry.includes(":: 429")) {
      continue;
    }
    if (normalizedSearchValue && !entry.includes(normalizedSearchValue)) {
      continue;
    }
    tracker.failedRequests.splice(index, 1);
    consumed += 1;
  }

  return consumed;
};

const consumeExpectedPostLogoutRateLimitNoise = (tracker) => {
  const expectedPaths = ["/api/imports", "/api/app-config"];
  let consumed = 0;
  for (let index = tracker.failedRequests.length - 1; index >= 0; index -= 1) {
    const entry = String(tracker.failedRequests[index] || "");
    if (!entry.includes("GET") || !entry.includes(":: 429")) {
      continue;
    }
    const matchedExpectedPath = expectedPaths.some((pathFragment) => entry.includes(pathFragment));
    if (!matchedExpectedPath) {
      continue;
    }
    tracker.failedRequests.splice(index, 1);
    consumed += 1;
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

  // Login bootstrap probes may be rate-limited in CI under peak load right after logout.
  // Ignore only these known post-logout GET 429s; keep all other failures strict.
  await page.waitForTimeout(250);
  consumeExpectedPostLogoutRateLimitNoise(tracker);
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
      await checkCollectionMutationConsistency(context);
      await checkCollectionRecordsStaleDeleteConflict(page, context, tracker);
      await checkCollectionReceiptUiFlow(page, context, tracker);
      await checkBackupRestoreUiFlow(page, context, tracker);

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
