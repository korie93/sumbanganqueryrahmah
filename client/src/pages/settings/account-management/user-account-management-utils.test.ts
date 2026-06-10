import assert from "node:assert/strict";
import test from "node:test";
import type { ManagedUser } from "@/pages/settings/types";
import {
  buildAccountActionQueue,
  buildAccountHealthMetrics,
  buildUserAccountManagementBadgeSummary,
  getUserAccountManagementDescription,
} from "@/pages/settings/account-management/user-account-management-utils";

function createManagedUser(overrides: Partial<ManagedUser> = {}): ManagedUser {
  return {
    id: overrides.id ?? "user-1",
    username: overrides.username ?? "operator",
    fullName: overrides.fullName ?? "Operator",
    email: overrides.email ?? "operator@example.test",
    role: overrides.role ?? "user",
    status: overrides.status ?? "active",
    mustChangePassword: overrides.mustChangePassword ?? false,
    passwordResetBySuperuser: overrides.passwordResetBySuperuser ?? false,
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    activatedAt: overrides.activatedAt ?? "2026-01-01T00:00:00.000Z",
    lastLoginAt: overrides.lastLoginAt ?? null,
    passwordChangedAt: overrides.passwordChangedAt ?? null,
    isBanned: overrides.isBanned ?? false,
    failedLoginAttempts: overrides.failedLoginAttempts ?? 0,
    lockedAt: overrides.lockedAt ?? null,
    lockedReason: overrides.lockedReason ?? null,
    lockedBySystem: overrides.lockedBySystem ?? false,
  };
}

test("getUserAccountManagementDescription returns focused mobile copy", () => {
  assert.equal(
    getUserAccountManagementDescription(true),
    "Manage closed accounts, mail previews, and reset requests in focused sections.",
  );
});

test("getUserAccountManagementDescription returns desktop copy", () => {
  assert.equal(
    getUserAccountManagementDescription(false),
    "Organize account creation, mail previews, managed users, and pending reset requests into focused sections without crowding the main Security page.",
  );
});

test("buildUserAccountManagementBadgeSummary preserves badge order and variants", () => {
  assert.deepEqual(
    buildUserAccountManagementBadgeSummary({
      managedUserCount: 8,
      outboxCount: 3,
      pendingResetCount: 2,
    }),
    [
      { label: "Accounts", total: 8, variant: "secondary" },
      { label: "Outbox", total: 3, variant: "outline" },
      { label: "Reset Requests", total: 2, variant: "outline" },
    ],
  );
});

test("buildAccountHealthMetrics summarizes visible user account risk signals", () => {
  const metrics = buildAccountHealthMetrics({
    managedUserTotal: 25,
    managedUsers: [
      createManagedUser({ id: "active-1", status: "active" }),
      createManagedUser({ id: "locked-1", lockedAt: "2026-01-02T00:00:00.000Z" }),
      createManagedUser({ id: "banned-1", isBanned: true }),
    ],
    outboxTotal: 4,
    pendingResetTotal: 2,
  });

  assert.deepEqual(
    metrics.map(({ id, value, tone }) => ({ id, value, tone })),
    [
      { id: "directory-total", value: 25, tone: "neutral" },
      { id: "visible-active", value: 1, tone: "neutral" },
      { id: "visible-restricted", value: 2, tone: "danger" },
      { id: "pending-resets", value: 2, tone: "warning" },
    ],
  );
});

test("buildAccountActionQueue orders urgent account work before lower priority follow-up", () => {
  const queue = buildAccountActionQueue({
    managedUserTotal: 25,
    managedUsers: [
      createManagedUser({ id: "locked-1", lockedAt: "2026-01-02T00:00:00.000Z" }),
      createManagedUser({ id: "pending-1", status: "pending_activation" }),
      createManagedUser({ id: "password-1", mustChangePassword: true }),
    ],
    outboxTotal: 3,
    pendingResetTotal: 2,
  });

  assert.deepEqual(
    queue.map(({ id, count, priority, targetTab }) => ({
      id,
      count,
      priority,
      targetTab,
    })),
    [
      {
        id: "pending-reset-requests",
        count: 2,
        priority: "high",
        targetTab: "pending-password-reset-requests",
      },
      {
        id: "restricted-visible-accounts",
        count: 1,
        priority: "high",
        targetTab: "managed-account",
      },
      {
        id: "pending-activation-visible",
        count: 1,
        priority: "medium",
        targetTab: "managed-account",
      },
      {
        id: "password-required-visible",
        count: 1,
        priority: "medium",
        targetTab: "managed-account",
      },
      {
        id: "local-outbox-review",
        count: 3,
        priority: "low",
        targetTab: "local-mail-outbox",
      },
    ],
  );
});

test("buildAccountActionQueue returns a calm empty state when no account work is pending", () => {
  assert.deepEqual(
    buildAccountActionQueue({
      managedUserTotal: 0,
      managedUsers: [],
      outboxTotal: 0,
      pendingResetTotal: 0,
    }),
    [
      {
        id: "no-urgent-actions",
        label: "No urgent account actions",
        count: 0,
        description: "No reset, lock, ban, activation, or outbox signals need attention.",
        priority: "low",
        targetTab: "managed-account",
      },
    ],
  );
});
