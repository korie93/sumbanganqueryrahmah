import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MonitorPageProvider, useMonitorPageContext } from "@/pages/monitor/MonitorPageContext";
import type { MonitorPageState } from "@/pages/monitor/useMonitorPageState";

test("useMonitorPageContext throws when rendered outside the provider", () => {
  function Consumer() {
    useMonitorPageContext();
    return null;
  }

  assert.throws(
    () => renderToStaticMarkup(createElement(Consumer)),
    /MonitorPageProvider/i,
  );
});

test("MonitorPageProvider exposes the monitor page state to descendants", () => {
  function Consumer() {
    const { lastUpdatedLabel } = useMonitorPageContext();
    return createElement("span", null, lastUpdatedLabel);
  }

  const markup = renderToStaticMarkup(
    createElement(
      MonitorPageProvider,
      {
        state: { lastUpdatedLabel: "12:34:56" } as MonitorPageState,
        children: createElement(Consumer),
      },
    ),
  );

  assert.match(markup, /12:34:56/);
});
