import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDashboardRoleDistributionRowAriaLabel,
  buildDashboardTopUserRowAriaLabel,
} from "@/pages/dashboard/dashboard-row-aria";

test("buildDashboardTopUserRowAriaLabel summarizes top user activity", () => {
  assert.equal(
    buildDashboardTopUserRowAriaLabel({
      formattedLastLogin: "14/04/2026, 09:30",
      index: 1,
      user: {
        username: "superuser",
        role: "superuser",
        loginCount: 14,
        lastLogin: "2026-04-14T01:30:00.000Z",
      },
    }),
    "Top active user 1, superuser, role superuser, 14 logins, last login 14/04/2026, 09:30",
  );
});

test("buildDashboardRoleDistributionRowAriaLabel summarizes role counts", () => {
  assert.equal(
    buildDashboardRoleDistributionRowAriaLabel({
      item: {
        role: "admin",
        count: 5,
      },
    }),
    "Role admin, 5 users",
  );
});
