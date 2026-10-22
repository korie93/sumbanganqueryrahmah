import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashboardAccountOptions } from "@/lib/api/collection-dashboard-account";
import { ManagedAccountDashboardStatus } from "./ManagedAccountDashboardStatus";

type Link = DashboardAccountOptions["link"];
const activeLink = { nicknameId: "nickname-1", nickname: "STAFF.SYNTHETIC", accountRole: "user", isActive: true };
const renderStatus = (link: Link | undefined, loadError = false) => renderToStaticMarkup(
  createElement(ManagedAccountDashboardStatus, { link, loadError }),
);

test("Dashboard nickname linked badge retains readable text, success tokens and decorative icon", () => {
  const markup = renderStatus(activeLink);
  assert.match(markup, /Dipautkan: STAFF\.SYNTHETIC/);
  for (const token of ["border-success/20", "bg-success/10", "text-success"]) assert.ok(markup.includes(token));
  assert.doesNotMatch(markup, /text-warning|text-muted-foreground/);
  assert.match(markup, /aria-live="polite" aria-atomic="true"/);
  assert.match(markup, /<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(markup, /<button|tabindex=/);
});

test("Dashboard nickname requiring review uses warning tokens without claiming an active link", () => {
  const markup = renderStatus({ ...activeLink, isActive: false });
  assert.match(markup, />Perlu semakan<\/span>/);
  for (const token of ["border-warning/20", "bg-warning/10", "text-warning"]) assert.ok(markup.includes(token));
  assert.doesNotMatch(markup, /text-success|Dipautkan:/);
});

test("Dashboard nickname unset and explicitly removed states remain distinct and neutral", () => {
  const unset = renderStatus(null);
  const removed = renderStatus({ ...activeLink, nicknameId: null, nickname: null, isActive: false });
  assert.match(unset, />Belum ditetapkan<\/span>/);
  assert.match(removed, />Tiada pautan<\/span>/);
  for (const markup of [unset, removed]) {
    for (const token of ["border-border", "bg-muted", "text-muted-foreground"]) assert.ok(markup.includes(token));
    assert.doesNotMatch(markup, /text-success|text-warning|Dipautkan:/);
  }
});

test("Dashboard nickname loading and load failure never appear as a known unset or linked state", () => {
  const pending = renderStatus(undefined);
  const failed = renderStatus(undefined, true);
  assert.match(pending, />Memuatkan status…<\/span>/);
  assert.match(failed, />Status tidak tersedia<\/span>/);
  for (const markup of [pending, failed]) {
    assert.match(markup, /text-muted-foreground/);
    assert.doesNotMatch(markup, /text-success|text-warning|Belum ditetapkan|Tiada pautan|Dipautkan:/);
  }
});

test("Dashboard nickname status permits wrapping and escapes nickname text", () => {
  const nickname = `<script>${"LONG".repeat(30)}</script>`;
  const markup = renderStatus({ ...activeLink, nickname });
  assert.match(markup, /whitespace-normal/);
  assert.doesNotMatch(markup, /whitespace-nowrap/);
  assert.match(markup, /max-w-full min-w-0/);
  assert.match(markup, /<span class="min-w-0 break-words">/);
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
});

test("Dashboard nickname status preserves the existing active-link fallback label", () => {
  assert.match(renderStatus({ ...activeLink, nickname: null }), /Dipautkan: Nickname Collection/);
});
