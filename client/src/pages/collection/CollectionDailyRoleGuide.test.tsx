import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionDailyRoleGuide } from "@/pages/collection/CollectionDailyRoleGuide";

test("CollectionDailyRoleGuide explains superuser calendar controls including OFF", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyRoleGuide, {
      role: "superuser",
      selectedUsersLabel: "Ali",
      canManage: true,
      canEditCalendar: true,
    }),
  );

  assert.match(markup, /Superuser workspace/);
  assert.match(markup, /Working, Holiday\/Leave atau OFF/);
  assert.match(markup, /Edit per nickname/);
});

test("CollectionDailyRoleGuide distinguishes admin and user workspaces", () => {
  const adminMarkup = renderToStaticMarkup(
    createElement(CollectionDailyRoleGuide, {
      role: "admin",
      selectedUsersLabel: "3 staff nicknames selected",
      canManage: true,
      canEditCalendar: false,
    }),
  );
  const userMarkup = renderToStaticMarkup(
    createElement(CollectionDailyRoleGuide, {
      role: "user",
      selectedUsersLabel: "siti",
      canManage: false,
      canEditCalendar: false,
    }),
  );

  assert.match(adminMarkup, /Admin workspace/);
  assert.match(adminMarkup, /Status calendar dikawal oleh superuser/);
  assert.match(userMarkup, /User workspace/);
  assert.match(userMarkup, /Lihat prestasi harian sendiri/);
});
