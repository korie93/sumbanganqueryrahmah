import { expect, test, type Page } from "@playwright/test";
import { installFixture } from "./helpers/save-collection-fixture";

const jobId = "synthetic-backup-recovery";
const activityId = "synthetic-backup-login";
const job = {
  id: jobId, type: "create", status: "running", requestedBy: "guidance.superuser",
  requestedAt: "2026-10-10T08:00:00.000Z", startedAt: "2026-10-10T08:00:01.000Z", finishedAt: null,
  backupId: null, backupName: "Synthetic recovery backup", queuePosition: 0, result: null, error: null,
};

async function setup(page: Page, baseURL: string | undefined, recover = false) {
  const fixture = await installFixture(page, baseURL, { role: "superuser" });
  await page.addInitScript(({ recover, jobId, activityId }) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    sessionStorage.setItem("activityId", activityId);
    if (recover && !sessionStorage.getItem("synthetic-backup-initialized")) {
      sessionStorage.setItem("synthetic-backup-initialized", "1");
      sessionStorage.setItem("backup-job-tracking", JSON.stringify({
        scope: JSON.stringify(["guidance-superuser", activityId]), jobId, handled: false,
      }));
    }
  }, { recover, jobId, activityId });
  await page.route((url) => url.pathname === "/api/settings", (route) => route.fulfill({ json: { categories: [{
    id: "general", name: "General", description: "Synthetic settings", settings: [],
  }] } }));
  await page.route((url) => url.pathname === "/api/backups" && !url.searchParams.has("async"),
    (route) => route.fulfill({ json: { backups: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } } }));
  return fixture;
}

async function selectSection(page: Page, name: string) {
  const launcher = page.getByTestId("button-open-settings-sections");
  if (await launcher.isVisible()) {
    await launcher.click();
    const menu = page.getByRole("dialog", { name: "Settings Menu", exact: true });
    await menu.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    await expect(menu).toBeHidden();
  } else {
    await page.getByRole("navigation", { name: "Settings Navigation", exact: true })
      .getByRole("button", { name, exact: true }).click();
  }
}

test("Impeccable backup recovery revalidates remounts and retries unknown status without stale completion", async ({ page, baseURL }) => {
  const fixture = await setup(page, baseURL, true);
  let reads = 0;
  let fail = false;
  let completed = false;
  let release!: () => void;
  let gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.pathname === `/api/backups/jobs/${jobId}`, async (route) => {
    reads += 1;
    await gate;
    await route.fulfill(fail ? { status: 503, json: { message: "Synthetic status unavailable" } }
      : { json: { ...job, status: completed ? "completed" : "running", finishedAt: completed ? "2026-10-10T08:00:02.000Z" : null } });
  });
  try {
    await page.goto("/settings?section=backup-restore");
    await expect.poll(() => reads).toBe(1);
    await expect(page.getByText("Checking backup or restore job", { exact: true })).toBeVisible();
    await expect(page.getByText("Backup job in progress", { exact: true })).toBeHidden();
    release();
    await expect(page.getByText("Backup job in progress", { exact: true })).toBeVisible();
    await selectSection(page, "General");
    gate = new Promise<void>((resolve) => { release = resolve; });
    const beforeRemount = reads;
    await selectSection(page, "Backup & Restore");
    await expect.poll(() => reads).toBeGreaterThan(beforeRemount);
    await expect(page.getByText("Checking backup or restore job", { exact: true })).toBeVisible();
    await expect(page.getByText("Backup job in progress", { exact: true })).toBeHidden();
    fail = true; release();
    await expect(page.getByText("Could not check job status", { exact: true })).toBeVisible();
    await expect(page.getByTestId("button-create-backup")).toBeDisabled();
    fail = false; completed = true;
    await page.getByRole("button", { name: "Retry job status", exact: true }).click();
    await expect(page.getByText("Could not check job status", { exact: true })).toBeHidden();
    await expect(page.getByText("Kerja terakhir selesai", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("backup-job-tracking") || "null")?.handled)).toBe(true);
    await expect(page.getByTestId("button-create-backup")).toBeEnabled();
    expect(fixture.unexpected).toEqual([]); expect(fixture.errors).toEqual([]);
  } finally { release(); fixture.release(); }
});

test("Impeccable backup recovery observes a queued POST that finishes after replacement section mount", async ({ page, baseURL }) => {
  const fixture = await setup(page, baseURL);
  let posts = 0;
  let reads = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.pathname === "/api/backups" && url.searchParams.get("async") === "1", async (route) => {
    expect(route.request().method()).toBe("POST");
    posts += 1; await gate;
    await route.fulfill({ status: 202, json: { message: "Synthetic queued", job: { ...job, status: "queued" } } });
  });
  await page.route((url) => url.pathname === `/api/backups/jobs/${jobId}`, (route) => {
    reads += 1; return route.fulfill({ json: job });
  });
  try {
    await page.goto("/settings?section=backup-restore");
    await page.getByTestId("button-create-backup").click();
    await page.getByTestId("input-backup-name").fill("Synthetic recovery backup");
    await page.getByTestId("button-confirm-create").click();
    await expect.poll(() => posts).toBe(1);
    await page.keyboard.press("Escape");
    await selectSection(page, "General");
    await selectSection(page, "Backup & Restore");
    await expect(page.getByText("Status kerja belum disahkan", { exact: true })).toBeVisible();
    release();
    await expect.poll(() => reads).toBeGreaterThan(0);
    await expect(page.getByText("Backup job in progress", { exact: true })).toBeVisible();
    await expect(page.getByTestId("button-create-backup")).toBeDisabled();
    expect(posts).toBe(1);
    expect(fixture.unexpected).toEqual([]); expect(fixture.errors).toEqual([]);
  } finally { release(); fixture.release(); }
});
