import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCollectionSectionShortLabel } from "./collection-section-labels";
import type { CollectionSubPage } from "./types";

const readSource = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

test("desktop section labels stay short without changing collection route keys", () => {
  const labels: Record<CollectionSubPage, string> = {
    save: "Simpan",
    records: "Rekod",
    summary: "Summary",
    "monthly-comparison": "Monthly",
    daily: "Daily",
    "billing-principal": "OSP",
    "nickname-summary": "Nickname",
    "manage-nicknames": "Manage",
  };
  for (const [key, expected] of Object.entries(labels)) {
    assert.equal(getCollectionSectionShortLabel(key as CollectionSubPage, "Full accessible section label"), expected);
  }
});

test("each visible short label is contained in its full accessible section name", () => {
  const accessibleNames: Record<CollectionSubPage, string> = {
    save: "Simpan Collection Individual",
    records: "View Rekod Collection",
    summary: "Collection Summary",
    "monthly-comparison": "Monthly Comparison",
    daily: "Collection Daily",
    "billing-principal": "Billing Principal (OSP)",
    "nickname-summary": "Nickname Summary",
    "manage-nicknames": "Manage Nickname",
  };
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  for (const [key, fullName] of Object.entries(accessibleNames)) {
    const visibleLabel = getCollectionSectionShortLabel(key, fullName);
    assert.ok(visibleLabel.trim().length > 0);
    assert.ok(normalize(fullName).includes(normalize(visibleLabel)), `${key}: visible label must be part of the accessible name`);
  }
});

test("an unknown future section retains its original label instead of becoming blank", () => {
  for (const key of ["future-section", "constructor", "__proto__", "toString"]) {
    assert.equal(getCollectionSectionShortLabel(key, "Future Collection Section"), "Future Collection Section");
  }
});

test("compact labels preserve full accessible names and native navigation buttons on every viewport", () => {
  const source = readSource("CollectionSidebar.tsx");
  const desktop = source;
  assert.match(desktop, /aria-label="Collection sections"/);
  assert.match(desktop, /className="collection-section-nav/);
  assert.match(desktop, /type="button"/);
  assert.match(desktop, /aria-label=\{item\.label\}/);
  assert.match(desktop, /title=\{item\.label\}/);
  assert.match(desktop, /getAriaCurrentPageProps\(active\)/);
  assert.match(desktop, /onSelectSubPage\(item\.key\)/);
  assert.match(desktop, /collection-section-label-short/);
  assert.match(desktop, /getCollectionSectionShortLabel\(item\.key, item\.label\)/);
  assert.doesNotMatch(desktop, /role="tablist"|role="tab"|onKeyDown|tabIndex=\{-1\}/);
});

test("mobile uses the same horizontal section navigation without a duplicate drawer", () => {
  const source = readSource("CollectionSidebar.tsx");
  assert.equal((source.match(/<nav\b/g) || []).length, 1);
  assert.doesNotMatch(source, /<Sheet|useIsMobile|collection-mobile-launcher|role="tab"/);
  assert.match(source, /getCollectionSectionShortLabel\(item\.key, item\.label\)/);
});

test("revealing a selected desktop section only scrolls its strip and cleans up resize observation", () => {
  const source = readSource("CollectionSidebar.tsx");
  const reveal = source.slice(source.indexOf("const revealSection"), source.indexOf("return (\n    <nav"));
  assert.match(reveal, /querySelector<HTMLButtonElement>\('\[data-active="true"\]'\)/);
  assert.match(reveal, /nav\.scrollLeft/);
  assert.match(reveal, /new ResizeObserver\(revealCurrent\)/);
  assert.match(reveal, /observer\?\.observe\(nav\)/);
  assert.match(reveal, /observer\?\.disconnect\(\)/);
  assert.doesNotMatch(reveal, /scrollIntoView|window\.scrollTo|document\.scroll|requestAnimationFrame|setInterval/);
});

test("collection context and navigation share a wrapper without removing section content", () => {
  const source = readSource("../CollectionReport.tsx");
  assert.match(source, /className="collection-report-navigation"/);
  assert.match(source, /title="Collection Report"/);
  assert.match(source, /collection-report-context/);
  assert.match(source, /collection-report-content/);
  assert.match(source, /items=\{navigation\.sidebarItems\}/);
  assert.match(source, /selectedSubPage=\{navigation\.subPage\}/);
  assert.match(source, /onSelectSubPage=\{navigation\.handleSelectSubPage\}/);
  assert.match(source, /<CollectionReportContent/);
  assert.match(source, /nicknameReauthenticationRequired=\{nicknameAccess\.nicknameReauthenticationRequired\}/);
  assert.match(source, /<CollectionNicknameDialog/);
});

test("the Records compact context and strip apply to every route and viewport", () => {
  const css = readSource("../CollectionReport.css");
  assert.match(css, /\.collection-section-nav[^}]*flex-wrap: nowrap/s);
  assert.match(css, /\.collection-section-nav[^}]*overflow-x: auto/s);
  assert.match(css, /\.collection-section-link[^}]*min-height: 44px/s);
  assert.match(css, /\.collection-report-context \.ops-page-heading\s*>\s*div:first-child[^}]*clip/s);
  assert.match(css, /\.ops-page-frame\.collection-report-frame[^}]*gap: var\(--spacing-4\)/s);
  assert.doesNotMatch(css, /collection-report-frame--save|collection-report-save-shortcut/);
  assert.doesNotMatch(css, /\.collection-report-content[^}]*\.ops-header-card[^}]*display: none/s);
  const page = readSource("../CollectionReport.tsx");
  assert.doesNotMatch(page, /eyebrow=|description=|collection-report-save-shortcut|collection-report-frame--save/);
  const saveCss = readSource("../collection/SaveCollectionPage.css");
  assert.match(saveCss, /@media \(max-width: 767px\)\s*\{[\s\S]*?\.save-collection-shortcut-hint\s*\{\s*display:\s*none;/);
});

test("the desktop staff badge constrains its actions wrapper and preserves the complete nickname tooltip", () => {
  const css = readSource("../CollectionReport.css");
  const desktop = css;
  const wrapper = desktop.match(/\.collection-report-context \.ops-page-heading\s*>\s*div:nth-child\(2\)\s*\{([^}]+)\}/)?.[1];
  assert.ok(wrapper, "Constrain the shared actions wrapper inside the desktop context");
  assert.match(wrapper, /display:\s*block;/);
  assert.match(wrapper, /(?:^|;)\s*width:\s*100%;/);
  assert.match(wrapper, /min-width:\s*0;/);
  assert.match(wrapper, /max-width:\s*100%;/);
  const badge = desktop.match(/\.collection-report-staff-badge\s*\{([^}]+)\}/)?.[1];
  assert.ok(badge);
  assert.match(badge, /max-width:\s*100%;/);
  assert.match(badge, /overflow:\s*hidden;/);
  assert.match(badge, /text-overflow:\s*ellipsis;/);
  assert.match(badge, /white-space:\s*nowrap;/);
  const page = readSource("../CollectionReport.tsx");
  assert.match(page, /title=\{`Staff Nickname: \$\{staffNicknameLabel\}`\}/);
  assert.match(page, /collection-report-staff-prefix[^>]*>Staff Nickname: <\/span>\{staffNicknameLabel\}/);
});
