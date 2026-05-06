import assert from "node:assert/strict";
import test from "node:test";
import { LayoutDashboard, Settings } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SideTabNavigation } from "@/components/navigation/SideTabNavigation";

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
