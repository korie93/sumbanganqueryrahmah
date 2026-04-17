import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InfoHint } from "@/components/monitor/InfoHint";
import { TooltipProvider } from "@/components/ui/tooltip";
import { assertNoAccessibilityViolations } from "@/test-utils/axe";

test("InfoHint renders an icon-only button with a meaningful accessible name", async () => {
  const markup = renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement("main", { "aria-label": "Info hint accessibility preview" }, [
        createElement(InfoHint, {
          key: "default",
          text: "Operational state: NORMAL, DEGRADED, atau PROTECTION.",
        }),
        createElement(InfoHint, {
          key: "explicit",
          text: "Worker capacity details.",
          label: "Show more information about worker capacity",
        }),
      ]),
    ),
  );

  assert.match(markup, /aria-label="Operational state: NORMAL, DEGRADED, atau PROTECTION\."/);
  assert.match(markup, /aria-label="Show more information about worker capacity"/);
  await assertNoAccessibilityViolations(`<!doctype html><html lang="ms"><body>${markup}</body></html>`);
});
