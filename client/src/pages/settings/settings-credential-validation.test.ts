import assert from "node:assert/strict"
import test from "node:test"

import {
  INVALID_CREDENTIAL_USERNAME_MESSAGE,
  normalizeCredentialEmail,
  normalizeCredentialFullName,
  normalizeCredentialUsername,
  validateCredentialUsername,
} from "@/pages/settings/settings-credential-validation"

test("settings credential normalization keeps account identifiers consistent", () => {
  assert.equal(normalizeCredentialUsername("  Alice.Admin "), "alice.admin")
  assert.equal(normalizeCredentialEmail("  ADMIN@Example.com "), "admin@example.com")
  assert.equal(normalizeCredentialFullName("  Alice Example "), "Alice Example")
})

test("validateCredentialUsername reuses the shared username rule and message", () => {
  assert.equal(validateCredentialUsername("alice.admin"), null)
  assert.equal(validateCredentialUsername("a"), INVALID_CREDENTIAL_USERNAME_MESSAGE)
})
