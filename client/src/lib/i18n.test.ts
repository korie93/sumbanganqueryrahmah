import assert from "node:assert/strict";
import test from "node:test";

import { getAppLocale, normalizeAppLocale, setAppLocale, translate } from "./i18n";

test("i18n normalizes supported locales with Malay as the safe default", () => {
  assert.equal(normalizeAppLocale("en-US"), "en");
  assert.equal(normalizeAppLocale("ms-MY"), "ms");
  assert.equal(normalizeAppLocale("fr-FR"), "ms");
});

test("translate resolves namespaced keys and interpolates values", () => {
  const originalLocale = getAppLocale();
  try {
    setAppLocale("en");
    assert.equal(translate("common.app.language.ms"), "Malay");
    assert.equal(translate("errors.retryAfter", { seconds: 4 }), "Please wait 4 seconds before trying again.");

    setAppLocale("ms");
    assert.equal(translate("common.app.language.en"), "Inggeris");
    assert.equal(translate("forms.validation.required"), "Ruangan ini wajib diisi.");
    assert.equal(translate("common.navbar.mobileMenuLabel"), "Buka menu navigasi");
    assert.equal(translate("common.horizontalScroll.hint"), "Tatal untuk lagi");
  } finally {
    setAppLocale(originalLocale);
  }
});

test("translate returns the key for missing translations without logging warnings", () => {
  assert.equal(translate("common.missing.key"), "common.missing.key");
});
