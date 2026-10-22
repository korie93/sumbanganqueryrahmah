import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsSidebar } from "./SettingsSidebar";
import { SettingsSaveBar } from "./SettingsSaveBar";
import type { SettingCategory } from "./types";

const noop = () => undefined;
const categories: SettingCategory[] = [
  { id: "general", name: "General", description: "General settings", settings: [] },
  { id: "permissions", name: "Roles & Permissions", description: "Review role access", settings: [] },
];

function renderNavigation(items = categories) {
  return renderToStaticMarkup(createElement(SettingsSidebar, {
    categories: items,
    categoryDirtyMap: new Map([["permissions", 2]]),
    mobileOpen: false,
    onMobileOpenChange: noop,
    onSelectCategory: noop,
    onSidebarCollapsedChange: noop,
    selectedCategory: "permissions",
    sidebarCollapsed: false,
  }));
}

test("Settings desktop navigation exposes authorized categories, current section and dirty count without a second rail", () => {
  const markup = renderNavigation();
  assert.match(markup, /<nav aria-label="Settings Navigation"/);
  assert.match(markup, /flex min-w-0 flex-wrap/);
  assert.match(markup, /rounded-lg border border-border\/70 bg-muted\/20/);
  assert.match(markup, /h-auto min-h-11 max-w-full/);
  assert.match(markup, /aria-current="page"/);
  assert.match(markup, /Roles &amp; Permissions/);
  assert.match(markup, /aria-label="2 unsaved changes"/);
  assert.equal((markup.match(/aria-current="page"/g) ?? []).length, 1);
  assert.doesNotMatch(markup, /<aside|expandedWidth|Backup/);
});

test("Settings distinguishes backup configuration from backup operations without hiding either destination", () => {
  const markup = renderNavigation([
    ...categories,
    { id: "server-backup-category", name: "Backup & Restore", description: "Backup lifecycle and recovery controls.", settings: [] },
    { id: "backup-restore", name: "Backup & Restore", description: "Create and restore backups.", settings: [] },
  ]);
  assert.match(markup, />Backup Settings<\/span>/);
  assert.equal((markup.match(/>Backup &amp; Restore<\/span>/g) || []).length, 1);
  assert.equal((markup.match(/<button\b/g) || []).length, 4);
  assert.match(markup, /title="Backup lifecycle and recovery controls\."/);
  assert.match(markup, /title="Create and restore backups\."/);
});

test("Settings mobile has one named section launcher and no clipped duplicate navigation strip", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { innerWidth: 390, matchMedia: () => ({ matches: true }) },
  });
  try {
    const markup = renderNavigation();
    assert.match(markup, /aria-label="Browse Settings: Roles &amp; Permissions"/);
    assert.match(markup, /aria-haspopup="dialog"/);
    assert.match(markup, /aria-expanded="false"/);
    assert.match(markup, /2 sections/);
    assert.match(markup, /min-h-11 max-w-full/);
    assert.match(markup, /hidden shrink-0 text-xs text-muted-foreground sm:inline/);
    assert.match(markup, />Settings<\/span>/);
    assert.doesNotMatch(markup, /Swipe sections|Settings Sections|<nav/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("Settings account launcher keeps one bounded section chooser instead of a duplicate desktop strip", () => {
  const markup = renderToStaticMarkup(createElement(SettingsSidebar, {
    compact: true,
    categories,
    categoryDirtyMap: new Map([["permissions", 2]]),
    mobileOpen: false,
    onMobileOpenChange: noop,
    onSelectCategory: noop,
    onSidebarCollapsedChange: noop,
    selectedCategory: "permissions",
    sidebarCollapsed: false,
  }));
  assert.equal((markup.match(/<button\b/g) ?? []).length, 1);
  assert.match(markup, /data-testid="button-open-settings-sections"/);
  assert.match(markup, /aria-label="Browse Settings: Roles &amp; Permissions"/);
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /h-auto min-h-11 max-w-full/);
  assert.match(markup, /w-full justify-start sm:w-fit/);
  assert.match(markup, /break-words text-foreground/);
  assert.doesNotMatch(markup, /<h1|<nav|\d sections/);
});

test("Settings primary navigation precedes its single category heading without changing account workspace headings", () => {
  const source = readFileSync(new URL("../Settings.tsx", import.meta.url), "utf8");
  assert.ok(source.indexOf("<SettingsSidebar") < source.indexOf("<OperationalPageHeader"));
  assert.match(source, /!controller\.isAccountManagementCategory \? <OperationalPageHeader/);
  assert.match(source, /title=\{categoryLabel\}/);
  assert.match(source, /getSettingsCategoryLabel\(controller\.currentCategory\)/);
  assert.doesNotMatch(source, /eyebrow="Administration"/);
  const accountHeader = readFileSync(new URL("./account-management/UserAccountManagementHeader.tsx", import.meta.url), "utf8");
  assert.equal((accountHeader.match(/<h1\b/g) ?? []).length, 1);
  assert.match(accountHeader, /<h1[^>]*>Account Management<\/h1>/);
});

test("Settings save keeps dirty and saving guards, semantic status and keyboard-safe sticky behavior", () => {
  const render = (dirtyCount: number, saving: boolean) => renderToStaticMarkup(createElement(SettingsSaveBar, {
    dirtyCount, saving, onSave: noop, changeSummary: [],
  }));
  assert.match(render(0, false), /No unsaved changes/);
  assert.match(render(0, false), /disabled=""/);
  assert.match(render(2, false), /2 unsaved changes/);
  assert.doesNotMatch(render(2, false), /disabled=""/);
  assert.match(render(2, true), /Saving\.\.\./);
  assert.match(render(2, true), /disabled=""/);
  const source = readFileSync(new URL("./SettingsSaveBar.tsx", import.meta.url), "utf8");
  assert.match(source, /keyboardOpen \? "static" : "sticky bottom-0/);
  assert.match(source, /data-floating-ai-avoid="true"/);
  assert.match(source, /safe-area-inset-bottom/);
  assert.doesNotMatch(source, /sqr-backdrop|shadow-lg|text-amber|text-emerald/);
});
