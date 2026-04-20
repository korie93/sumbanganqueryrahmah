import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAppRouteAutoRetryDescription,
  getUiMessage,
  resolveUiLocale,
} from "@/lib/i18n/messages";

test("ui message catalog defaults to English for unknown locales", () => {
  assert.equal(resolveUiLocale("fr-FR"), "en");
  assert.equal(
    getUiMessage("unexpectedApiResponse", "fr-FR"),
      "The server returned an unexpected response. Please refresh and try again.",
    );
});

test("ui message catalog supports Malay locale variants", () => {
  assert.equal(resolveUiLocale("ms-MY"), "ms");
  assert.equal(
    getUiMessage("dashboardUnexpectedResponse", "ms-MY"),
      "Papan pemuka menerima respons pelayan yang tidak dijangka. Sila muat semula dan cuba lagi.",
    );
});

test("ui message catalog formats route auto-retry copy through the shared message helpers", () => {
  assert.equal(getUiMessage("appRouteRetryPageAction"), "Retry Page");
  assert.equal(
    formatAppRouteAutoRetryDescription({
      attempt: 2,
      delayMs: 1_500,
      maxAttempts: 3,
    }),
    "A page bundle failed to load. Trying again automatically (2/3) in 2s.",
  );
  assert.equal(
    formatAppRouteAutoRetryDescription(
      {
        attempt: 1,
        delayMs: 2_000,
        maxAttempts: 3,
      },
      "ms-MY",
    ),
    "Bundle halaman gagal dimuatkan. Sedang cuba semula secara automatik (1/3) dalam 2s.",
  );
});
