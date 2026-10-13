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

test("short desktop labels preserve full accessible names and native navigation buttons", () => {
  const source = readSource("CollectionSidebar.tsx");
  const desktop = source.slice(source.indexOf("if (!isMobile)"), source.indexOf('data-testid="collection-mobile-launcher"'));
  assert.match(desktop, /aria-label="Collection sections"/);
  assert.match(desktop, /className="collection-section-nav/);
  assert.match(desktop, /type="button"/);
  assert.match(desktop, /aria-label=\{item\.label\}/);
  assert.match(desktop, /title=\{item\.label\}/);
  assert.match(desktop, /getAriaCurrentPageProps\(active\)/);
  assert.match(desktop, /onSelectSubPage\(item\.key\)/);
  assert.match(desktop, /collection-section-label-full[^>]*>\{item\.label\}/);
  assert.match(desktop, /collection-section-label-short/);
  assert.match(desktop, /getCollectionSectionShortLabel\(item\.key, item\.label\)/);
  assert.doesNotMatch(desktop, /role="tablist"|role="tab"|onKeyDown|tabIndex=\{-1\}/);
});

test("desktop-only presentation keeps the mobile section drawer and full labels", () => {
  const source = readSource("CollectionSidebar.tsx");
  const mobile = source.slice(source.indexOf('data-testid="collection-mobile-launcher"'));
  assert.match(mobile, /<Sheet open=\{mobileOpen\} onOpenChange=\{onMobileOpenChange\}/);
  assert.match(mobile, /aria-label="Collection sections mobile"/);
  assert.match(mobile, /aria-haspopup="dialog"/);
  assert.match(mobile, /launcherRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(mobile, /onSelectSubPage\(item\.key\);\s*onMobileOpenChange\(false\)/);
  assert.match(mobile, />\{item\.label\}<\/span>/);
  assert.doesNotMatch(mobile, /getCollectionSectionShortLabel|collection-section-label-short/);
});

test("revealing a selected desktop section only scrolls its strip and cleans up resize observation", () => {
  const source = readSource("CollectionSidebar.tsx");
  const reveal = source.slice(source.indexOf("useEffect(() =>"), source.indexOf("if (!isMobile)"));
  assert.match(reveal, /window\.matchMedia\(LARGE_UP_MEDIA_QUERY\)\.matches/);
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

test("desktop label styling and compact context are scoped to the large breakpoint", () => {
  const css = readSource("../CollectionReport.css");
  const desktopOffset = css.indexOf("@media (min-width: 1024px)");
  assert.ok(desktopOffset >= 0, "Desktop polish must not change the mobile/tablet layout");
  const beforeDesktop = css.slice(0, desktopOffset);
  const desktop = css.slice(desktopOffset);
  assert.match(beforeDesktop, /@media \(min-width: 768px\)/);
  assert.match(beforeDesktop, /gap: var\(--spacing-6\)/);
  assert.match(beforeDesktop, /\.collection-section-label-short[^}]*display: none/s);
  assert.match(desktop, /\.collection-section-nav[^}]*flex-wrap: nowrap/s);
  assert.match(desktop, /\.collection-section-nav[^}]*overflow-x: auto/s);
  assert.match(desktop, /\.collection-section-label-full[^}]*display: none/s);
  assert.match(desktop, /\.collection-section-label-short[^}]*display: inline/s);
  assert.match(desktop, /\.collection-report-context \.ops-page-heading\s*>\s*div:first-child[^}]*clip/s);
  assert.match(desktop, /\.ops-page-frame\.collection-report-frame[^}]*gap: var\(--spacing-4\)/s);
  assert.doesNotMatch(css, /\.collection-report-content[^}]*\.ops-header-card[^}]*display: none/s);
});

test("the desktop staff badge constrains its actions wrapper and preserves the complete nickname tooltip", () => {
  const css = readSource("../CollectionReport.css");
  const desktop = css.slice(css.indexOf("@media (min-width: 1024px)"));
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
  assert.match(page, /Staff Nickname: \{staffNicknameLabel\}/);
});
