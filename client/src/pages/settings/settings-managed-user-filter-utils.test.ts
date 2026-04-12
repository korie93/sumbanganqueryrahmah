import assert from "node:assert/strict"
import test from "node:test"

import {
  normalizeManagedUserRoleFilter,
  normalizeManagedUserStatusFilter,
} from "@/pages/settings/settings-managed-user-filter-utils"

test("normalizeManagedUserRoleFilter trims and lowercases supported values", () => {
  assert.equal(normalizeManagedUserRoleFilter(" ADMIN "), "admin")
  assert.equal(normalizeManagedUserRoleFilter("user"), "user")
})

test("normalizeManagedUserRoleFilter falls back to all for unsupported values", () => {
  assert.equal(normalizeManagedUserRoleFilter("superuser"), "all")
})

test("normalizeManagedUserStatusFilter trims and lowercases supported values", () => {
  assert.equal(normalizeManagedUserStatusFilter(" LOCKED "), "locked")
  assert.equal(normalizeManagedUserStatusFilter("Pending_Activation"), "pending_activation")
})

test("normalizeManagedUserStatusFilter falls back to all for unsupported values", () => {
  assert.equal(normalizeManagedUserStatusFilter("archived"), "all")
})
