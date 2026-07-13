import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { LayoutDashboard, Settings } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SideTabNavigation } from "@/components/navigation/SideTabNavigation";

const lazySideTabNavigationSource = readFileSync(
  path.resolve(process.cwd(), "client/src/components/navigation/LazySideTabNavigation.tsx"),
  "utf8",
);

test("SideTabNavigation keeps active and inactive descriptions on accessible foreground tokens", () => {
  const markup = renderToStaticMarkup(
    createElement(SideTabNavigation, {
      items: [
        {
          key: "dashboard",
          label: "Dashboard",
          icon: LayoutDashboard,
          description: "Ringkasan sistem semasa",
        },
        {
          key: "settings",
          label: "Settings",
          icon: Settings,
          description: "Urus tetapan sistem",
        },
      ],
      selectedKey: "dashboard",
      onSelect: () => undefined,
      mobileOpen: false,
      onMobileOpenChange: () => undefined,
      collapsed: false,
      onCollapsedChange: () => undefined,
      navigationLabel: "Navigasi sisi",
    }),
  );

  assert.match(markup, /text-muted-foreground/);
  assert.doesNotMatch(markup, /text-foreground\/72/);
  assert.doesNotMatch(markup, /text-foreground\/62/);
});

test("SideTabNavigation keeps pixel width contracts stable when root text size changes", () => {
  const renderNavigation = (collapsed: boolean) => renderToStaticMarkup(
    createElement(SideTabNavigation, {
      items: [
        {
          key: "dashboard",
          label: "Dashboard",
          icon: LayoutDashboard,
        },
      ],
      selectedKey: "dashboard",
      onSelect: () => undefined,
      mobileOpen: false,
      onMobileOpenChange: () => undefined,
      collapsed,
      onCollapsedChange: () => undefined,
      expandedWidth: 308,
      collapsedWidth: 88,
    }),
  );

  assert.match(renderNavigation(false), /w-\[308px\]/);
  assert.match(renderNavigation(true), /w-\[88px\]/);
  assert.doesNotMatch(renderNavigation(false), /w-\[19\.25rem\]/);
});

test("lazy side navigation fallback preserves width without CSP-blocked inline styles", () => {
  assert.match(lazySideTabNavigationSource, /resolveSideTabWidthClass/);
  assert.match(lazySideTabNavigationSource, /fallbackWidthClassName/);
  assert.doesNotMatch(lazySideTabNavigationSource, /style=\{/);
});
