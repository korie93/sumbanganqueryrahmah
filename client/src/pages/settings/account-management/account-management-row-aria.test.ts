import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLocalMailOutboxRowAriaLabel,
  buildManagedAccountRowAriaLabel,
  buildPendingPasswordResetRowAriaLabel,
} from "@/pages/settings/account-management/account-management-row-aria";

test("buildManagedAccountRowAriaLabel summarizes core account details", () => {
  assert.equal(
    buildManagedAccountRowAriaLabel({
      formattedLastLoginAt: "14/04/2026, 10:30",
      formattedLockedAt: "14/04/2026, 09:00",
      user: {
        activatedAt: null,
        createdAt: "",
        createdBy: null,
        email: "operator.one@example.com",
        failedLoginAttempts: 0,
        fullName: "Operator One",
        id: "u-1",
        isBanned: false,
        lastLoginAt: "2026-04-14T02:30:00.000Z",
        lockedAt: "2026-04-14T01:00:00.000Z",
        lockedBySystem: false,
        lockedReason: null,
        mustChangePassword: true,
        passwordChangedAt: null,
        passwordResetBySuperuser: false,
        role: "admin",
        status: "active",
        updatedAt: "",
        username: "operator.one",
      },
    }),
    "Managed account operator.one, profile Operator One, role admin, status active, last login 14/04/2026, 10:30, locked 14/04/2026, 09:00, password change required",
  );
});

test("buildPendingPasswordResetRowAriaLabel summarizes reset metadata", () => {
  assert.equal(
    buildPendingPasswordResetRowAriaLabel({
      formattedCreatedAt: "14/04/2026, 08:15",
      request: {
        approvedBy: null,
        createdAt: "2026-04-14T00:15:00.000Z",
        email: "member@example.com",
        expiresAt: null,
        fullName: "Member One",
        id: "r-1",
        isBanned: false,
        requestedByUser: "superuser",
        resetType: "email",
        role: "user",
        status: "pending",
        usedAt: null,
        userId: "u-2",
        username: "member.one",
      },
    }),
    "Pending password reset for member.one, profile Member One, status pending, requested by superuser, created 14/04/2026, 08:15",
  );
});

test("buildLocalMailOutboxRowAriaLabel summarizes recipient and subject", () => {
  assert.equal(
    buildLocalMailOutboxRowAriaLabel({
      entry: {
        createdAt: "2026-04-14T00:15:00.000Z",
        id: "mail-1",
        previewUrl: "/preview/mail-1",
        subject: "Activation email",
        to: "member@example.com",
      },
      formattedCreatedAt: "14/04/2026, 08:15",
    }),
    "Mail preview to member@example.com, subject Activation email, created 14/04/2026, 08:15",
  );
});
