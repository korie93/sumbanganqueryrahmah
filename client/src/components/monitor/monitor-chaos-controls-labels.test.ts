import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MonitorChaosControls } from "./MonitorChaosControls";
import { CHAOS_OPTIONS } from "./monitorData";

test("the scenario selector has a persistent visible label associated with its combobox", () => {
  const profile = CHAOS_OPTIONS[0]!;
  const markup = renderToStaticMarkup(createElement(TooltipProvider, null,
    createElement(MonitorChaosControls, {
      chaosType: profile.type, selectedChaosProfile: profile,
      chaosMagnitude: "1", chaosDurationMs: "1000", chaosLoading: false,
      lastChaosMessage: null, onChaosTypeChange() {}, onChaosMagnitudeChange() {},
      onChaosDurationChange() {}, onSubmit() {},
    }),
  ));
  const label = markup.match(/<label\b[^>]*for="monitor-chaos-type"[^>]*>Scenario Type<\/label>/)?.[0];
  const trigger = markup.match(/<button\b[^>]*id="monitor-chaos-type"[^>]*>/)?.[0];
  assert.ok(label, "Scenario Type remains visible after a scenario has been selected");
  assert.doesNotMatch(label, /sr-only/);
  assert.ok(trigger);
  assert.match(trigger, /role="combobox"/);
  assert.match(markup, /for="monitor-chaos-magnitude"/);
  assert.match(markup, /for="monitor-chaos-duration"/);
});
