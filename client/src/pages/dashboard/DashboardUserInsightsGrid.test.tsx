import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardUserInsightsGrid } from "@/pages/dashboard/DashboardUserInsightsGrid";

test("DashboardUserInsightsGrid renders inline fallbacks for failed user insight queries", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardUserInsightsGrid, {
      onRetryRoleDistribution: () => undefined,
      onRetryTopUsers: () => undefined,
      roleDistribution: undefined,
      roleErrorMessage: "Role distribution failed to load.",
      roleLoading: false,
      topUsers: undefined,
      topUsersErrorMessage: "Top users failed to load.",
      topUsersLoading: false,
    }),
  );

  assert.match(markup, /Top active users are unavailable/i);
  assert.match(markup, /User role distribution is unavailable/i);
});
