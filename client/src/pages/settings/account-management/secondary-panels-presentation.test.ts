import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CreateClosedAccountSection } from "./CreateClosedAccountSection";
import { CreateAccountDashboardNickname } from "./CreateAccountDashboardNickname";
import { LocalMailOutboxDesktopTable } from "./LocalMailOutboxDesktopTable";
import { LocalMailOutboxFiltersPanel } from "./LocalMailOutboxFiltersPanel";
import { PendingPasswordResetDesktopTable } from "./PendingPasswordResetDesktopTable";
import { PendingPasswordResetFiltersPanel } from "./PendingPasswordResetFiltersPanel";
import type { DevMailOutboxPreview, PendingPasswordResetRequest } from "../types";

const noop = () => undefined;
const emptyState = { title: "No results", description: "Try another search." };

test("create-account Dashboard nickname has one compact optional disclosure and is unnecessary for manager", () => {
  const markup = renderToStaticMarkup(createElement(CreateAccountDashboardNickname, {
    role: "user", selectedId: "", disabled: false, onChange: noop,
  }));
  assert.match(markup, /Kutipan Dashboard/);
  assert.match(markup, />Pilihan<\/span>/);
  assert.match(markup, /<h3[^>]*><button[^>]*type="button"/);
  assert.match(markup, /<button[^>]*class="[^"]*w-full/);
  assert.equal((markup.match(/<button\b/g) || []).length, 1);
  assert.match(markup, /aria-expanded="false"/);
  const panelId = markup.match(/aria-controls="([^"]+)"/)?.[1];
  assert.ok(panelId);
  assert.ok(markup.includes(`id="${panelId}" hidden=""`));
  assert.match(markup, /<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(markup, /Tetapkan nickname sekarang|Sembunyikan pilihan nickname/);
  assert.doesNotMatch(markup, /<select/);
  const manager = renderToStaticMarkup(createElement(CreateAccountDashboardNickname, {
    role: "manager", selectedId: "", disabled: false, onChange: noop,
  }));
  assert.match(manager, /nickname tidak diperlukan/);
  assert.doesNotMatch(manager, /<select|<button/);
});

test("create-account Dashboard disclosure remains a non-submit button while creating", () => {
  const markup = renderToStaticMarkup(createElement(CreateAccountDashboardNickname, {
    role: "admin", selectedId: "", disabled: true, onChange: noop,
  }));
  assert.match(markup, /<button[^>]*type="button"[^>]*disabled=""/);
  assert.match(markup, /aria-expanded="false"/);
  assert.doesNotMatch(markup, /<select/);
});

test("create account keeps labeled production fields, inline errors and native submit without a password field", () => {
  const markup = renderToStaticMarkup(createElement(CreateClosedAccountSection, {
    createEmailInput: "",
    createFieldErrors: { createEmailInput: "Activation email is required." },
    createFullNameInput: "",
    createRoleInput: "admin",
    createUsernameInput: "operator",
    creatingManagedUser: false,
    onCreateEmailInputChange: noop,
    onCreateFieldBlur: noop,
    onCreateFullNameInputChange: noop,
    onCreateManagedUser: noop,
    onCreateRoleInputChange: noop,
    onCreateUsernameInputChange: noop,
  }));
  for (const field of ["full-name", "username", "email", "role"]) {
    assert.match(markup, new RegExp(`for="create-closed-account-${field}"`));
    assert.match(markup, new RegExp(`id="create-closed-account-${field}"`));
  }
  assert.match(markup, /<form[^>]*novalidate=""/);
  assert.match(markup, /type="submit"/);
  assert.match(markup, /aria-invalid="true"/);
  assert.match(markup, /id="create-closed-account-email-error"[^>]*role="alert"/);
  assert.match(markup, /Administrative access/);
  assert.doesNotMatch(markup, /type="password"/);
});

test("create account aligns scoped 44px controls and block labels without narrowing help or error text", () => {
  const markup = renderToStaticMarkup(createElement(CreateClosedAccountSection, {
    createEmailInput: "",
    createFieldErrors: {
      createUsernameInput: "Choose a different username.",
      createEmailInput: "Activation email is required.",
    },
    createFullNameInput: "",
    createRoleInput: "user",
    createUsernameInput: "",
    creatingManagedUser: false,
    onCreateEmailInputChange: noop,
    onCreateFieldBlur: noop,
    onCreateFullNameInputChange: noop,
    onCreateManagedUser: noop,
    onCreateRoleInputChange: noop,
    onCreateUsernameInputChange: noop,
  }));
  assert.match(markup, /class="grid min-w-0 gap-4 sm:grid-cols-2"/);
  for (const field of ["full-name", "username", "email", "role"]) {
    const control = markup.match(new RegExp(`<(?:input|select)[^>]*id="create-closed-account-${field}"[^>]*>`))?.[0];
    assert.ok(control, `${field} must retain its production control`);
    const classes = new Set(control.match(/class="([^"]+)"/)?.[1].split(/\s+/));
    for (const className of ["h-11", "min-h-11", "w-full", "min-w-0", "text-base", "md:text-sm"]) {
      assert.ok(classes.has(className), `${field} should have ${className}`);
    }
    if (field !== "role") {
      assert.ok(classes.has("sm:h-11"));
      assert.ok(classes.has("sm:min-h-11"));
      assert.ok(!classes.has("sm:h-9"));
      assert.ok(!classes.has("sm:min-h-9"));
    }
    assert.match(markup, new RegExp(`<div class="min-w-0 space-y-2"><label for="create-closed-account-${field}" class="block min-w-0 text-sm font-medium leading-5"`));
  }
  for (const field of ["username", "email"]) {
    for (const kind of ["help", "error"]) {
      assert.match(markup, new RegExp(`id="create-closed-account-${field}-${kind}" class="break-words text-xs leading-5 `));
    }
  }
  const submit = markup.match(/<button[^>]*type="submit"[^>]*>/)?.[0];
  assert.ok(submit);
  assert.match(submit, /class="[^"]*h-11 min-h-11 w-full sm:min-h-11 sm:w-auto"/);
});

test("secondary search inputs remain outside collapsed accessible filters", () => {
  const pending = renderToStaticMarkup(createElement(PendingPasswordResetFiltersPanel, {
    activeFilters: [], hasActiveFilters: false, searchQuery: "", statusFilter: "all",
    onClearAll: noop, onSearchQueryChange: noop, onStatusChange: noop,
  }));
  assert.match(pending, /for="pending-reset-search-query"/);
  assert.match(pending, /id="pending-reset-search-query"/);
  assert.match(pending, /aria-expanded="false" aria-controls="pending-reset-filters"/);
  assert.doesNotMatch(pending, /<select/);

  const outbox = renderToStaticMarkup(createElement(LocalMailOutboxFiltersPanel, {
    activeFilters: [], emailQuery: "", hasActiveFilters: false, sortDirection: "desc", subjectQuery: "",
    onClearAll: noop, onEmailQueryChange: noop, onSortDirectionChange: noop, onSubjectQueryChange: noop,
  }));
  assert.match(outbox, /for="local-mail-outbox-email-query"/);
  assert.match(outbox, /id="local-mail-outbox-email-query"/);
  assert.match(outbox, /aria-expanded="false" aria-controls="local-mail-outbox-filters"/);
  assert.doesNotMatch(outbox, /<select/);
});

test("pending reset remains review-only and secondary tables delegate scrolling to one outer region", () => {
  const markup = renderToStaticMarkup(createElement(PendingPasswordResetDesktopTable, {
    emptyState, loading: false, requests: [{
      id: "request-1", username: "operator", fullName: "Operator", email: "operator@example.test",
      requestedByUser: "operator", status: "active", isBanned: false, createdAt: "2026-10-01T00:00:00Z",
    } as PendingPasswordResetRequest],
  }));
  assert.equal((markup.match(/scope="col"/g) || []).length, 4);
  assert.match(markup, /tabindex="-1" class="[^"]*overflow-visible/);
  assert.doesNotMatch(markup, /<button/);

  for (const file of ["PendingPasswordResetSection.tsx", "LocalMailOutboxSection.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /SideTabDataPanel/);
    assert.match(source, /role="region"[^>]*tabIndex=\{0\}/);
    assert.match(source, /focus-visible:ring-inset/);
    assert.match(source, /scrollbar-gutter:stable/);
  }
});

test("outbox retains open/copy/delete actions and pending-deletion guard", () => {
  const markup = renderToStaticMarkup(createElement(LocalMailOutboxDesktopTable, {
    clearingDevMailOutbox: false, deletingDevMailOutboxId: "mail-1", emptyState, loading: false,
    entries: [{ id: "mail-1", to: "operator@example.test", subject: "Activation", createdAt: "2026-10-01T00:00:00Z", previewUrl: "/preview/mail-1" } as DevMailOutboxPreview],
    onCopyPreviewLink: async () => undefined, onOpenDeleteDialog: noop, onOpenPreviewDialog: noop,
  }));
  assert.match(markup, />Open<\/button>/);
  assert.match(markup, />Copy Link<\/button>/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>Deleting\.\.\.<\/button>/);
  assert.equal((markup.match(/scope="col"/g) || []).length, 4);
});

test("details keeps real action guards and modal transition focus handling; edit footer stays outside scroll body", () => {
  const detail = readFileSync(new URL("ManagedAccountDetailSheet.tsx", import.meta.url), "utf8");
  assert.match(detail, /<ManagedAccountLoginAccess user=\{user\}/);
  assert.match(detail, /onOpenAutoFocus=/);
  assert.match(detail, /onCloseAutoFocus=/);
  assert.match(detail, /!actionTransitionRef\.current && returnFocusRef\.current\?\.isConnected/);
  assert.match(detail, /user\.status !== "pending_activation" \|\| Boolean\(user\.isBanned\)/);
  assert.match(detail, /deletingManagedUserId === user\.id/);
  for (const callback of ["onEditUser", "onResetPassword", "onResendActivation", "onBanToggle", "onRequestDelete"]) {
    assert.match(detail, new RegExp(`runDetailAction\\(${callback}`));
  }
  const edit = readFileSync(new URL("../ManagedUserDialog.tsx", import.meta.url), "utf8");
  assert.match(edit, /min-h-0[^"\n]*overflow-y-auto/);
  assert.match(edit, /<\/div>\s*<DialogFooter className="shrink-0/);
  assert.match(edit, /onClick=\{onConfirmManagedSave\}/);
  assert.match(edit, /onManagedIsBannedChange\(event\.target\.value === "true"\)/);
  assert.match(edit, /await onSaveCriticalSettings\(\)/);
});
