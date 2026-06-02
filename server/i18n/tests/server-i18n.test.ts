import assert from "node:assert/strict";
import test from "node:test";
import { enServerMessages } from "../../locales/en/server";
import { t } from "../server";

test("server i18n resolves auth messages from the locale map", () => {
  assert.equal(t("auth.invalidCredentials"), "Invalid credentials");
  assert.equal(t("auth.sessionExpired"), "Session expired. Please login again.");
  assert.equal(
    t("auth.accountLocked"),
    "Your account has been locked due to too many incorrect login attempts. Please contact the system administrator.",
  );
});

test("server i18n locale values remain non-empty strings", () => {
  for (const [key, value] of Object.entries(enServerMessages)) {
    assert.equal(typeof value, "string", `${key} should be a string`);
    assert.ok(value.trim().length > 0, `${key} should not be empty`);
  }
});
