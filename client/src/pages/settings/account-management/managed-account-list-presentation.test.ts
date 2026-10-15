import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ManagedAccountsDesktopTable } from "./ManagedAccountsDesktopTable";
import { ManagedAccountsFiltersPanel } from "./ManagedAccountsFiltersPanel";
import { ManagedAccountsMobileList } from "./ManagedAccountsMobileList";
import { buildManagedAccountListActions, getManagedAccountLoginAccess } from "./managed-account-list-presentation";
import { buildManagedAccountAttentionSummary } from "./managed-accounts-utils";
import type { ManagedUser } from "@/pages/settings/types";

const base: ManagedUser = {
  id: "account-1", username: "member.one", fullName: "Member One", email: "member@example.test",
  role: "user", status: "active", mustChangePassword: false, passwordResetBySuperuser: false,
  createdBy: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
  activatedAt: "2026-10-01T00:00:00Z", lastLoginAt: null, passwordChangedAt: null, isBanned: false,
  failedLoginAttempts: 0, lockedAt: null, lockedReason: null, lockedBySystem: false,
};
const noop = () => undefined;
const callbacks = { onBanToggle: noop, onEditUser: noop, onRequestDelete: noop, onResetPassword: noop, onResendActivation: noop, onViewDetails: noop };
const emptyState = { title: "No accounts", description: "Adjust filters" };

for (const [fields, expected] of [
  [{ isBanned: true, status: "suspended", lockedAt: "2026-10-14T00:00:00Z", mustChangePassword: true }, "Banned"],
  [{ status: "banned", lockedAt: "2026-10-14T00:00:00Z" }, "Banned"],
  [{ status: "suspended", lockedAt: "2026-10-14T00:00:00Z", mustChangePassword: true }, "Suspended"],
  [{ status: "disabled", mustChangePassword: true }, "Disabled"],
  [{ status: "pending_activation", lockedAt: "2026-10-14T00:00:00Z", mustChangePassword: true }, "Login locked"],
  [{ status: "locked" }, "Login locked"],
  [{ mustChangePassword: true }, "Password change required"],
  [{ status: "pending_activation" }, "Pending activation"],
  [{ passwordResetBySuperuser: true }, "Active"],
] as Array<[Partial<ManagedUser>, string]>) {
  test(`managed list presents ${expected} without masking stronger record restrictions: ${JSON.stringify(fields)}`, () => {
    assert.equal(getManagedAccountLoginAccess({ ...base, ...fields }).label, expected);
  });
}

test("managed list keeps lock reason and unknown status truthful", () => {
  assert.equal(getManagedAccountLoginAccess({ ...base, lockedAt: "2026-10-14T00:00:00Z", lockedReason: "Security review required" }).description, "Security review required");
  assert.deepEqual(getManagedAccountLoginAccess({ ...base, status: "future_state" }), {
    label: "future_state", description: "Review the account record for access details", tone: "neutral",
  });
});

test("More retains all real callbacks and activation/delete guards even if called directly", () => {
  const called: string[] = [];
  const actionCallbacks = {
    onBanToggle: (user: ManagedUser) => called.push(`ban:${user.id}`),
    onDelete: (user: ManagedUser) => called.push(`delete:${user.id}`),
    onResetPassword: (user: ManagedUser) => called.push(`reset:${user.id}`),
    onResendActivation: (user: ManagedUser) => called.push(`resend:${user.id}`),
  };
  const blocked = buildManagedAccountListActions({ user: base, deletingManagedUserId: base.id, ...actionCallbacks });
  assert.deepEqual(blocked.map(({ id }) => id), ["reset", "resend", "ban", "delete"]);
  assert.equal(blocked.find(({ id }) => id === "resend")?.disabled, true);
  assert.equal(blocked.find(({ id }) => id === "delete")?.disabled, true);
  blocked.forEach((action) => action.onSelect());
  assert.deepEqual(called, ["reset:account-1", "ban:account-1"]);
  called.length = 0;
  const pending = buildManagedAccountListActions({ user: { ...base, status: "pending_activation" }, deletingManagedUserId: "another-account", ...actionCallbacks });
  pending.forEach((action) => action.onSelect());
  assert.deepEqual(called, ["reset:account-1", "resend:account-1", "ban:account-1", "delete:account-1"]);
  const banned = buildManagedAccountListActions({ user: { ...base, status: "pending_activation", isBanned: true }, deletingManagedUserId: null, ...actionCallbacks });
  assert.equal(banned.find(({ id }) => id === "resend")?.disabled, true);
  assert.equal(banned.find(({ id }) => id === "ban")?.label, "Unban");
});

test("desktop list has five compact semantic columns and only Details Edit More visible per account", () => {
  const markup = renderToStaticMarkup(createElement(ManagedAccountsDesktopTable, { deletingManagedUserId: null, emptyState, loading: false, managedUsers: [base], ...callbacks }));
  for (const title of ["Account", "Role", "Login access", "Last login", "Actions"]) assert.match(markup, new RegExp(`scope="col"[^>]*>${title}</th>`));
  assert.match(markup, /Managed accounts table/);
  assert.match(markup, /Never signed in/);
  assert.match(markup, /aria-label="Details for member.one"/);
  assert.match(markup, /aria-label="Edit member.one"/);
  assert.match(markup, /aria-label="More actions for member.one"/);
  assert.match(markup, /pr-20 text-right/);
  assert.equal((markup.match(/<button\b/g) || []).length, 3);
  assert.doesNotMatch(markup, /Next:|Send Reset Email|Resend Activation/);
});

test("mobile cards share truthful status and compact actions without duplicate action rows", () => {
  const markup = renderToStaticMarkup(createElement(ManagedAccountsMobileList, { deletingManagedUserId: null, emptyState, loading: false, managedUsers: [{ ...base, status: "suspended", mustChangePassword: true }], ...callbacks }));
  assert.match(markup, /Suspended/);
  assert.match(markup, /Login suspended/);
  assert.match(markup, /aria-label="More actions for member.one"/);
  assert.equal((markup.match(/<button\b/g) || []).length, 3);
  assert.doesNotMatch(markup, /shadow-sm|Next:|>Password change required</);
});

test("search stays outside initially folded filters with refresh and removable applied chips", () => {
  const markup = renderToStaticMarkup(createElement(ManagedAccountsFiltersPanel, {
    activeFilters: [{ id: "managed-role", label: "Role: Admin", onRemove: noop }],
    attentionSummary: buildManagedAccountAttentionSummary([base]), hasActiveFilters: true,
    loading: true, roleFilter: "admin", searchQuery: "", statusFilter: "all",
    onClearAll: noop, onRefresh: noop, onRoleChange: noop, onSearchQueryChange: noop, onStatusChange: noop,
  }));
  assert.match(markup, /name="managedAccountsSearchQuery"/);
  assert.match(markup, /Search accounts<\/label>/);
  assert.match(markup, /<button[^>]*aria-label="Filter managed accounts"[^>]*aria-expanded="false"[^>]*aria-controls=/);
  assert.match(markup, /<section[^>]*hidden=""[^>]*aria-label="Managed account filters"/);
  assert(markup.indexOf('name="managedAccountsSearchQuery"') < markup.indexOf('aria-label="Managed account filters"'));
  assert.match(markup, /id="managed-accounts-role-filter"/);
  assert.match(markup, /id="managed-accounts-status-filter"/);
  assert.match(markup, /Counts reflect accounts on the visible page/);
  assert.match(markup, /aria-label="Remove filter Role: Admin"/);
  const refresh = markup.match(/<button[^>]*aria-label="Refresh managed accounts"[^>]*>/)?.[0];
  assert.match(refresh || "", /disabled=""/);
});

test("workspace preserves pagination and confirmation boundaries without another summary or rail", () => {
  const source = readFileSync(new URL("./ManagedAccountsSection.tsx", import.meta.url), "utf8");
  assert.match(source, /data-testid="managed-accounts-workspace"/);
  assert.doesNotMatch(source, /SideTabDataPanel|ManagedAccountsAttentionSummary/);
  assert.match(source, /onPageChange=\{\(page\) => onQueryChange\(\{ page \}\)\}/);
  assert.match(source, /ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE, pageSize/);
  assert.match(source, /border-t border-border\/70 pr-16/);
  const actionSource = readFileSync(new URL("./ManagedAccountListActions.tsx", import.meta.url), "utf8");
  assert.match(actionSource, /pr-16 sm:pr-0/);
  for (const name of ["ManagedAccountDetailSheet", "ManagedAccountActionDialogs", "DeleteManagedAccountDialog"]) assert.match(source, new RegExp(`<${name}`));
  const actions = readFileSync(new URL("./ManagedAccountListActions.tsx", import.meta.url), "utf8");
  assert.match(actions, /onCloseAutoFocus/);
  assert.match(actions, /if \(action.disabled\) return/);
  assert.match(actions, /selectedAction.current = action.id !== "resend"/);
});
