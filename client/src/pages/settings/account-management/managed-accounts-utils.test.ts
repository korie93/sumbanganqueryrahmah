import assert from "node:assert/strict";
import test from "node:test";
import type { ManagedUser } from "@/pages/settings/types";
import {
  MANAGED_ACCOUNT_ATTENTION_FILTERS,
  MANAGED_ACCOUNT_STATUS_LABELS,
} from "@/pages/settings/account-management/managed-accounts-shared";
import {
  buildManagedAccountDetailFacts,
  buildManagedAccountRiskSummary,
  buildManagedAccountTimeline,
  getManagedAccountsEmptyMessage,
  normalizeManagedAccountsRoleFilter,
  normalizeManagedAccountsStatusFilter,
} from "@/pages/settings/account-management/managed-accounts-utils";

function createManagedUser(overrides: Partial<ManagedUser> = {}): ManagedUser {
  const baseUser: ManagedUser = {
    id: "user-1",
    username: "operator",
    fullName: "Operator One",
    email: "operator@example.test",
    role: "user",
    status: "active",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    createdBy: "superuser",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    activatedAt: "2026-01-01T01:00:00.000Z",
    lastLoginAt: "2026-01-02T01:00:00.000Z",
    passwordChangedAt: null,
    isBanned: false,
    failedLoginAttempts: 0,
    lockedAt: null,
    lockedReason: null,
    lockedBySystem: false,
  };

  return { ...baseUser, ...overrides };
}

test("normalizeManagedAccountsRoleFilter keeps supported values", () => {
  assert.equal(normalizeManagedAccountsRoleFilter("admin"), "admin");
  assert.equal(normalizeManagedAccountsRoleFilter("user"), "user");
});

test("normalizeManagedAccountsRoleFilter falls back to all", () => {
  assert.equal(normalizeManagedAccountsRoleFilter("superuser"), "all");
});

test("normalizeManagedAccountsStatusFilter keeps supported values", () => {
  assert.equal(normalizeManagedAccountsStatusFilter("locked"), "locked");
  assert.equal(normalizeManagedAccountsStatusFilter("pending_activation"), "pending_activation");
});

test("normalizeManagedAccountsStatusFilter falls back to all", () => {
  assert.equal(normalizeManagedAccountsStatusFilter("archived"), "all");
});

test("managed account status labels use user-facing copy", () => {
  assert.equal(MANAGED_ACCOUNT_STATUS_LABELS.pending_activation, "Pending activation");
  assert.equal(MANAGED_ACCOUNT_STATUS_LABELS.banned, "Banned");
});

test("managed account attention filters only include actionable statuses", () => {
  assert.deepEqual(
    MANAGED_ACCOUNT_ATTENTION_FILTERS.map((option) => option.value),
    ["locked", "banned", "pending_activation", "suspended", "disabled"],
  );
});

test("getManagedAccountsEmptyMessage returns loading copy", () => {
  assert.equal(
    getManagedAccountsEmptyMessage({
      loading: true,
      total: 0,
      hasActiveFilters: false,
    }),
    "Loading users...",
  );
});

test("getManagedAccountsEmptyMessage returns default empty copy", () => {
  assert.equal(
    getManagedAccountsEmptyMessage({
      loading: false,
      total: 0,
      hasActiveFilters: false,
    }),
    "No managed accounts found.",
  );
});

test("getManagedAccountsEmptyMessage returns filtered empty copy", () => {
  assert.equal(
    getManagedAccountsEmptyMessage({
      loading: false,
      total: 0,
      hasActiveFilters: true,
    }),
    "No managed accounts match the current filters.",
  );
});

test("buildManagedAccountRiskSummary prioritizes banned and locked account states", () => {
  assert.deepEqual(
    buildManagedAccountRiskSummary(createManagedUser({ isBanned: true })),
    {
      label: "Banned",
      description: "This account is blocked from signing in until a superuser unbans it.",
      tone: "danger",
    },
  );

  assert.deepEqual(
    buildManagedAccountRiskSummary(
      createManagedUser({
        lockedAt: "2026-01-03T00:00:00.000Z",
        lockedReason: "Too many failed logins",
      }),
    ),
    {
      label: "Locked",
      description: "Too many failed logins",
      tone: "danger",
    },
  );
});

test("buildManagedAccountRiskSummary reports pending activation and healthy accounts", () => {
  assert.deepEqual(
    buildManagedAccountRiskSummary(
      createManagedUser({
        activatedAt: null,
        status: "pending_activation",
      }),
    ),
    {
      label: "Activation pending",
      description: "The user still needs to activate the account before normal access.",
      tone: "warning",
    },
  );

  assert.deepEqual(
    buildManagedAccountRiskSummary(createManagedUser()),
    {
      label: "Healthy",
      description: "No visible access restrictions are active for this account.",
      tone: "success",
    },
  );
});

test("buildManagedAccountDetailFacts formats core account fields for the detail sheet", () => {
  const facts = buildManagedAccountDetailFacts(
    createManagedUser({
      email: null,
      failedLoginAttempts: 3,
      fullName: null,
    }),
  );

  assert.deepEqual(
    facts.map(({ id, value }) => ({ id, value })),
    [
      { id: "username", value: "operator" },
      { id: "full-name", value: "-" },
      { id: "email", value: "-" },
      { id: "role", value: "user" },
      { id: "status", value: "active" },
      { id: "created-by", value: "superuser" },
      { id: "created-at", value: facts[6].value },
      { id: "updated-at", value: facts[7].value },
      { id: "last-login", value: facts[8].value },
      { id: "failed-attempts", value: "3" },
    ],
  );
});

test("buildManagedAccountTimeline sorts timestamped account events newest first", () => {
  const timeline = buildManagedAccountTimeline(
    createManagedUser({
      lockedAt: "2026-01-04T00:00:00.000Z",
      passwordChangedAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-05T00:00:00.000Z",
    }),
  );

  assert.deepEqual(
    timeline.map((item) => item.id),
    ["updated", "locked", "password-changed", "last-login", "activated", "created"],
  );
});

test("buildManagedAccountTimeline keeps untimed action flags after timestamped events", () => {
  const timeline = buildManagedAccountTimeline(
    createManagedUser({
      activatedAt: null,
      lastLoginAt: null,
      mustChangePassword: true,
      passwordChangedAt: null,
      status: "pending_activation",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
  );

  assert.deepEqual(
    timeline.map((item) => item.id),
    ["created", "activation-pending", "password-change-required"],
  );
});
