/**
 * A main landmark alone may belong to auth/session/tab-checking UI. Contracts
 * must wait for the real protected route before reading headings or layout.
 * This selector is inside the existing authenticated Suspense/ownership boundary;
 * blocked, unsupported and checking gates deliberately cannot satisfy it.
 */
export async function waitForProtectedContractContent(page, timeoutMs = 15_000) {
  await page.locator(".sqr-workspace main#main-content").first().waitFor({
    state: "visible",
    timeout: timeoutMs,
  });
}
