import assert from "node:assert/strict";
import test from "node:test";
import { getUiMessage, resolveUiLocale } from "@/lib/i18n/messages";

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
