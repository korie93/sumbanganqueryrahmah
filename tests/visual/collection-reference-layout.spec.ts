import { expect, test, type Locator, type Page } from "@playwright/test";
import { addReceipt, checkFixture, fillIdentity, installFixture, nickname, openSave } from "./helpers/save-collection-fixture";

// The real production frontend runs against the existing exact synthetic API
// fixture. No backend, account, production data or external URL is accessed.
test.use({ serviceWorkers: "block" });

const section = (page: Page, accent: "customer" | "payment" | "receipt") =>
  page.locator(`.save-collection-section[data-accent="${accent}"]`);

async function selectNickname(page: Page, selected = nickname) {
  await page.goto("/collection/save");
  await page.locator("#save-collection-superuser-nickname").click();
  await page.getByRole("button", { name: selected, exact: true }).click();
  await expect(page.locator("#save-collection-customer-name")).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
}

async function expectContained(element: Locator, container: Locator) {
  const bounds = (await element.boundingBox())!;
  const parent = (await container.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(parent.x - 1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(parent.x + parent.width + 1);
}

for (const width of [1920, 1600, 1440, 1280, 1024, 768, 390]) {
  test(`Collection reference layout preserves shell and responsive entry groups at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const fixture = await installFixture(page, baseURL, { role: "superuser", theme: "dark" });
    await selectNickname(page);
    const frame = page.locator(".collection-report-frame");
    await expect(frame).not.toHaveClass(/collection-report-frame--save/);
    await expect(frame).toHaveCSS("max-width", "1480px");
    await expect(frame.getByRole("heading", { name: "Collection Report", level: 1, exact: true })).toHaveCount(1);
    expect((await frame.locator(".collection-report-context .ops-page-heading > div:first-child").boundingBox())!.height).toBeLessThanOrEqual(1);
    await expect(page.getByRole("heading", { name: "Collection Report", level: 1, exact: true })).toHaveCount(1);

    // Baseline shell geometry is intentionally independent of the redesigned
    // content height. Keep the actual sidebar, header and main surface intact.
    const shell = await page.evaluate(() => {
      const box = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      return { topbar: box(".workspace-topbar"), sidebar: box(".workspace-sidebar"), main: box("#main-content") };
    });
    expect(shell.topbar.y).toBe(0);
    expect(shell.topbar.height).toBe(57);
    expect(shell.main.y).toBe(57);
    expect(shell.main.x).toBe(width >= 1024 ? 240 : 0);
    expect(shell.topbar.x).toBe(shell.main.x);
    expect(shell.topbar.width).toBe(width - shell.main.x);
    expect(shell.sidebar.width).toBe(width >= 1024 ? 240 : 0);

    const grid = page.locator(".save-collection-details-grid");
    const customer = section(page, "customer");
    const payment = section(page, "payment");
    const receipt = section(page, "receipt");
    await expect(customer.getByRole("heading", { name: "Customer Details", exact: true })).toBeVisible();
    await expect(payment.getByRole("heading", { name: "Payment Details", exact: true })).toBeVisible();
    await expect(receipt.getByRole("heading", { name: "Receipt Upload", exact: true })).toBeVisible();
    const shortcut = page.locator(".save-collection-shortcut-hint");
    const desktopShortcut = page.locator(".collection-report-save-shortcut");
    await expect(desktopShortcut).toHaveCount(0);
    if (width < 768) await expect(shortcut).toBeHidden();
    else await expect(shortcut).toBeVisible();
    await expect(shortcut).toHaveCount(1);
    const nicknameTrigger = page.locator("#save-collection-superuser-nickname");
    await expect(nicknameTrigger).toHaveCSS("height", "44px");
    await expect(page.getByRole("button", { name: "Muat Semula", exact: true })).toHaveCSS("height", "44px");
    const dateTrigger = page.getByTestId("save-collection-payment-date");
    const inputStyle = await page.locator("#save-collection-account-number").evaluate((input) => {
      const style = getComputedStyle(input);
      return { radius: style.borderRadius, border: style.borderColor, background: style.backgroundColor };
    });
    await expect(dateTrigger).toHaveCSS("height", "44px");
    await expect(dateTrigger).toHaveCSS("border-radius", inputStyle.radius);
    await expect(dateTrigger).toHaveCSS("border-color", inputStyle.border);
    await expect(dateTrigger).toHaveCSS("background-color", inputStyle.background);
    await expect(page.locator(".save-collection-draft-details")).toHaveCount(0);
    await expect(page.locator(".collection-save-nickname-context")).toHaveCount(0);
    const receiptHeader = receipt.locator(".save-collection-section-header");
    const clearPending = receiptHeader.getByRole("button", { name: "Clear Pending", exact: true });
    await expect(clearPending).toBeDisabled();
    await expect(page.getByRole("button", { name: "Clear Pending", exact: true })).toHaveCount(1);
    await expectContained(clearPending, receiptHeader);
    const uploadZone = receipt.locator(".save-collection-receipt-upload-zone--empty");
    await expect(uploadZone).toBeVisible();
    const upload = uploadZone.getByRole("button", { name: "Upload Receipt", exact: true });
    const uploadBox = (await upload.boundingBox())!;
    expect(uploadBox.width).toBeGreaterThanOrEqual(44);
    expect(uploadBox.height).toBeGreaterThanOrEqual(44);
    expect((await uploadZone.boundingBox())!.height).toBeLessThanOrEqual(width >= 768 ? 176 : 220);
    const gridBox = (await grid.boundingBox())!;
    const customerBox = (await customer.boundingBox())!;
    const paymentBox = (await payment.boundingBox())!;
    const receiptBox = (await receipt.boundingBox())!;
    const layout = await grid.evaluate((element) => ({
      gap: Number.parseFloat(getComputedStyle(element).columnGap),
      minimumColumn: 24 * Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    }));
    const fitsTwoColumns = gridBox.width >= layout.minimumColumn * 2 + layout.gap;
    if (width === 1440) expect(fitsTwoColumns).toBe(true);
    if (fitsTwoColumns) {
      expect(Math.abs(customerBox.y - paymentBox.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(customerBox.width - paymentBox.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(customerBox.width + paymentBox.width + layout.gap - gridBox.width)).toBeLessThanOrEqual(1);
      expect(paymentBox.x).toBeGreaterThanOrEqual(customerBox.x + customerBox.width + layout.gap - 1);
      const customerInput = (await page.locator("#save-collection-customer-name").boundingBox())!;
      const accountInput = (await page.locator("#save-collection-account-number").boundingBox())!;
      expect(Math.abs(customerInput.y - accountInput.y)).toBeLessThanOrEqual(1);
    } else {
      expect(paymentBox.y).toBeGreaterThanOrEqual(customerBox.y + customerBox.height);
      expect(Math.abs(customerBox.x - paymentBox.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(customerBox.width - gridBox.width)).toBeLessThanOrEqual(1);
    }
    expect(receiptBox.y).toBeGreaterThanOrEqual(paymentBox.y + paymentBox.height);
    expect(Math.abs(receiptBox.x - gridBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(receiptBox.width - gridBox.width)).toBeLessThanOrEqual(1);
    await expect(receipt.getByTestId("save-collection-readiness")).toBeVisible();
    const completeness = receipt.getByRole("progressbar", { name: "Required field completeness", exact: true });
    await expect(completeness).toHaveAttribute("max", "7");
    await expect(completeness).toHaveAttribute("value", "1");
    await expect(receipt.getByRole("list", { name: "Required field groups", exact: true }).getByRole("listitem")).toHaveCount(7);
    const footer = page.locator(".save-collection-submit-workspace");
    expect(await receipt.evaluate((element) => Boolean(element.compareDocumentPosition(
      document.querySelector(".save-collection-submit-workspace")!,
    ) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await expect(footer).toHaveCSS("position", "static");
    expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(receiptBox.y + receiptBox.height + 19);

    await expect(payment.locator("#save-collection-account-number")).toBeVisible();
    await expect(payment.locator("#save-collection-card-number")).toHaveAttribute("type", "password");
    await expect(payment.locator("fieldset")).toHaveCount(0);
    await expect(page.getByText("Isi sekurang-kurangnya satu: Account Number atau Card Number.", { exact: true })).toHaveCount(0);
    const paymentGrid = payment.locator(".save-collection-payment-fields");
    for (const field of ["account-number", "card-number", "batch", "payment-date-button", "amount"]) {
      const fieldRow = paymentGrid.locator(`:scope > div:has(#save-collection-${field})`);
      await expect(fieldRow).toHaveCount(1);
      await expectContained(page.locator(`#save-collection-${field}`), paymentGrid);
    }
    await expect(payment.locator(".save-collection-currency-prefix")).toHaveAttribute("aria-hidden", "true");
    await expect(payment.locator("#save-collection-amount")).toHaveAccessibleName("Amount (RM)");
    const fileInput = receipt.locator('input[name="collectionReceiptUpload"]');
    await expect(fileInput).toHaveAttribute("accept", ".jpg,.jpeg,.png,.webp,.pdf");
    await expect(fileInput).not.toHaveAttribute("multiple");
    const actions = page.locator("#save-collection-actions");
    await expect(actions.getByRole("button", { name: "Reset Form", exact: true })).toBeEnabled();
    await expect(actions.getByRole("button", { name: "Semak Medan Wajib", exact: true })).toBeEnabled();

    await testInfo.attach(`reference-dark-${width}`, {
      body: await page.screenshot({ path: testInfo.outputPath(`reference-dark-${width}.png`), fullPage: true, animations: "disabled" }),
      contentType: "image/png",
    });
    expect(fixture.saves).toHaveLength(0);
    await checkFixture(page, fixture);
  });
}

for (const role of ["admin", "superuser"] as const) {
  for (const width of [1440, 390]) {
    test(`Collection receipt heading action clears only pending receipts for ${role} at ${width}px`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 1000 });
      const fixture = await installFixture(page, baseURL, { role, theme: "dark", aiEnabled: true });
      if (role === "superuser") await selectNickname(page);
      else await openSave(page);
      const receipt = section(page, "receipt");
      const clearPending = receipt.locator(".save-collection-section-header").getByRole("button", { name: "Clear Pending", exact: true });
      const customerName = page.locator("#save-collection-customer-name");
      await customerName.fill("Synthetic customer retained after clear");
      await expect(clearPending).toBeDisabled();
      await expect(receipt.locator(".save-collection-receipt-upload-zone--empty")).toBeVisible();

      await addReceipt(page);
      await expect(clearPending).toBeEnabled();
      await expect(page.getByRole("button", { name: "Clear Pending", exact: true })).toHaveCount(1);
      await expect(receipt.locator(".save-collection-receipt-upload-zone--empty")).toHaveCount(0);
      await clearPending.scrollIntoViewIfNeeded();
      await clearPending.focus();
      await expect(clearPending).toBeFocused();
      await expect(page.getByTestId("floating-ai-toggle")).toBeVisible();
      expect((await clearPending.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await clearPending.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return [
          [rect.x + 4, rect.y + 4], [rect.right - 4, rect.y + 4],
          [rect.x + 4, rect.bottom - 4], [rect.right - 4, rect.bottom - 4],
          [rect.x + rect.width / 2, rect.y + rect.height / 2],
        ].every(([x, y]) => element.contains(document.elementFromPoint(x!, y!)));
      })).toBe(true);
      await clearPending.click({ trial: true });
      await expect(clearPending).toBeFocused();
      await page.keyboard.press("Enter");

      await expect(page.getByTestId("receipt-draft-card")).toHaveCount(0);
      await expect(receipt.getByText("No pending receipt.", { exact: true })).toHaveCount(1);
      await expect(receipt.locator(".save-collection-receipt-upload-zone--empty")).toBeVisible();
      await expect(clearPending).toBeDisabled();
      await expect(customerName).toHaveValue("Synthetic customer retained after clear");
      expect(await receipt.locator('input[name="collectionReceiptUpload"]').evaluate((input: HTMLInputElement) => input.files?.length)).toBe(0);
      expect(fixture.saves).toHaveLength(0);
      expect(fixture.matches).toBe(0);
      await checkFixture(page, fixture);
    });
  }
}

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 740, height: 360 }]) {
  test(`Collection reference mobile actions never cover fields or sit under idle AI at ${viewport.width}x${viewport.height}`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize(viewport);
    const fixture = await installFixture(page, baseURL, { role: "superuser", theme: "dark", aiEnabled: true });
    await selectNickname(page);
    const footer = page.locator(".save-collection-submit-workspace");
    await expect(footer).toHaveCSS("position", "static");
    expect((await footer.boundingBox())!.y).toBeGreaterThan(viewport.height);

    for (const suffix of ["customer-name", "customer-ic-number", "customer-phone", "account-number", "card-number", "amount"]) {
      const input = page.locator(`#save-collection-${suffix}`);
      await input.click();
      await expect(input).toBeFocused();
      const bounds = (await input.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(57);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
    }

    await page.getByRole("button", { name: "Reset Form", exact: true }).focus();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    // The launcher avoids the save form controls. Verify pointer
    // clearance at every action corner, not just Playwright's center click.
    await expect(page.getByTestId("floating-ai-toggle")).toBeVisible();
    for (const name of ["Reset Form", "Semak Medan Wajib"]) {
      const button = footer.getByRole("button", { name, exact: true });
      await expect(button).toBeInViewport({ ratio: 1 });
      expect(await button.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return [
          [rect.x + 4, rect.y + 4], [rect.right - 4, rect.y + 4],
          [rect.x + 4, rect.bottom - 4], [rect.right - 4, rect.bottom - 4],
          [rect.x + rect.width / 2, rect.y + rect.height / 2],
        ].every(([x, y]) => element.contains(document.elementFromPoint(x!, y!)));
      })).toBe(true);
      await button.click({ trial: true });
    }
    await testInfo.attach("mobile-action-clearance", {
      body: await page.screenshot({ path: testInfo.outputPath("mobile-action-clearance.png"), animations: "disabled" }),
      contentType: "image/png",
    });
    expect(fixture.saves).toHaveLength(0);
    expect(fixture.matches).toBe(0);
    await checkFixture(page, fixture);
  });
}

for (const width of [1440, 390]) {
  test(`Collection reference layout contains long draft values and preserves card privacy at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 1000 });
    const longNickname = `SyntheticCollector${"UnbrokenNickname".repeat(12)}`;
    const longCustomer = `Synthetic${"UnbrokenCustomer".repeat(11)}`;
    const card = "00009007199254740993";
    const fixture = await installFixture(page, baseURL, { role: "superuser", theme: "dark", additionalNickname: longNickname });
    await selectNickname(page, longNickname);
    await fillIdentity(page);
    await page.locator("#save-collection-customer-name").fill(longCustomer);
    await page.locator("#save-collection-account-number").fill("");
    await page.locator("#save-collection-card-number").fill(card);
    await page.locator("#save-collection-amount").fill("1234567.89");
    await page.getByRole("button", { name: "Semak Medan Wajib", exact: true }).click();
    const readiness = page.getByTestId("save-collection-readiness");
    await expect(readiness.getByRole("progressbar", { name: "Required field completeness", exact: true })).toHaveAttribute("value", "6");
    await expect(readiness).toHaveAttribute("data-ready", "false");
    await expect(readiness.getByText(longCustomer, { exact: true })).toBeVisible();
    await expect(readiness.getByText(longNickname, { exact: true })).toBeVisible();
    await expectContained(readiness.getByText(longCustomer, { exact: true }), readiness);
    await expectContained(readiness.getByText(longNickname, { exact: true }), readiness);
    await expectContained(page.locator("#save-collection-superuser-nickname"), page.locator(".collection-report-frame"));
    await expect(page.locator("#save-collection-card-number")).toHaveAttribute("type", "password");
    await expect(readiness).not.toContainText(card);
    await readiness.getByTestId("toggle-card-number-review").click();
    await expect(readiness.getByTestId("toggle-card-number-review")).toHaveAttribute("aria-pressed", "true");
    await expect(readiness.locator("#save-collection-card-review-value")).toHaveText(card);
    await expectContained(readiness.locator("#save-collection-card-review-value"), readiness);
    await readiness.getByTestId("toggle-card-number-review").click();
    await expect(readiness).not.toContainText(card);
    await expect(page.locator("#save-collection-card-number")).toHaveValue(card);
    await expect(page.locator("#save-collection-amount")).toHaveValue("1234567.89");
    expect(fixture.saves).toHaveLength(0);
    expect(fixture.matches).toBe(0);
    await checkFixture(page, fixture);
  });
}

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 740, height: 360 }, { width: 1440, height: 1000 }]) {
  test(`Save collection idle AI avoids visible controls while scrolling at ${viewport.width}x${viewport.height}`, async ({ page, baseURL }) => {
    await page.setViewportSize(viewport);
    const fixture = await installFixture(page, baseURL, { role: "superuser", theme: "dark", aiEnabled: true });
    await selectNickname(page);
    const launcher = page.getByTestId("floating-ai-toggle");
    const customerName = page.locator("#save-collection-customer-name");
    const assertLauncherClearance = async () => {
      await expect(launcher).toBeVisible();
      await expect(launcher).toHaveCSS("pointer-events", "auto");
      await expect.poll(async () => page.evaluate(() => {
        const trigger = document.querySelector('[data-testid="floating-ai-toggle"]')!.getBoundingClientRect();
        return Array.from(document.querySelectorAll<HTMLElement>(
          ".save-collection-workspace :is(input:not([type='hidden']), textarea, select, button, summary, [role='combobox']), .collection-save-nickname-controls :is(button, [role='combobox'])",
        )).flatMap((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || style.display === "none") return [];
          const visibleWidth = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
          const visibleHeight = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 57));
          if (visibleWidth === 0 || visibleHeight === 0) return [];
          const overlap = Math.max(0, Math.min(rect.right, trigger.right) - Math.max(rect.left, trigger.left))
            * Math.max(0, Math.min(rect.bottom, trigger.bottom) - Math.max(rect.top, trigger.top));
          return overlap > 1 ? [element.id || element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName] : [];
        });
      }), { message: "Idle launcher must leave visible Save Collection controls unobstructed" }).toEqual([]);
    };

    await assertLauncherClearance();
    await customerName.focus();
    if (viewport.width < 768) await expect(launcher).toHaveCSS("pointer-events", "none");
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await assertLauncherClearance();

    for (const target of [
      customerName,
      page.locator("#save-collection-customer-phone"),
      page.locator("#save-collection-account-number"),
      page.getByTestId("save-collection-payment-date"),
      page.locator("#save-collection-amount"),
      section(page, "receipt").getByRole("button", { name: "Upload Receipt", exact: true }),
      page.getByRole("button", { name: "Reset Form", exact: true }),
    ]) {
      await target.scrollIntoViewIfNeeded();
      await assertLauncherClearance();
    }

    await launcher.click();
    const dialog = page.getByRole("dialog", { name: "AI SQR", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Kecilkan panel AI SQR", exact: true }).click();
    await expect(dialog).toBeHidden();
    await assertLauncherClearance();
    expect(fixture.saves).toHaveLength(0);
    expect(fixture.matches).toBe(0);
    await checkFixture(page, fixture);
  });
}
