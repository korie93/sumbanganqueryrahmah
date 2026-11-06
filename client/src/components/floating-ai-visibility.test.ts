import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldKeepFloatingAiPanelMounted,
  shouldTrackFloatingAiDom,
  isFloatingAiSaveCollectionRoute,
  isFloatingAiSavedMobileRoute,
  isFloatingAiGuardedWorkspaceRoute,
} from "@/components/floating-ai-visibility";

test("shouldKeepFloatingAiPanelMounted stays mounted while the panel is open", () => {
  assert.equal(
    shouldKeepFloatingAiPanelMounted({
      hasActivated: true,
      isOpen: true,
      isThinking: false,
      aiStatus: "IDLE",
    }),
    true,
  );
});

test("idle workspace guards match confirmed routes and normalized monitor aliases only", () => {
  const idle = { isOpen: false, isThinking: false, aiStatus: "IDLE" as const };
  for (const [activePage, location, search] of [
    ["home", "/", ""],
    ["home", "/?month=2026-11", ""],
    ["import", "/IMPORT/", ""],
    ["collection-report", "/collection/summary?year=2026", ""],
    ["collection-report", "/collection/billing-principal/", ""],
    ["collection-report", "/collection/nickname-summary", ""],
    ["monitor", "/dashboard", ""],
    ["monitor", "/activity", ""],
    ["monitor", "/monitor", "section=dashboard"],
    ["monitor", "/monitor", "section=activity"],
    ["monitor", "/monitor?section=activity#list", ""],
    ["forbidden", "/403", ""],
  ]) {
    const guardedWorkspaceRoute = isFloatingAiGuardedWorkspaceRoute(activePage!, location!, search);
    assert.equal(guardedWorkspaceRoute, true, activePage + ":" + location + "?" + search);
    assert.equal(shouldTrackFloatingAiDom({ ...idle, guardedWorkspaceRoute }), true);
  }
  for (const [activePage, location, search] of [
    ["home", "/home", ""],
    ["settings", "/", ""],
    ["import", "/imported", ""],
    ["collection-report", "/collection/summary-other", ""],
    ["collection-report", "/collection/nickname-summary-other", ""],
    ["collection-report", "/collection/records", ""],
    ["viewer", "/viewer", ""],
    ["monitor", "/monitor", ""],
    ["monitor", "/monitor", "section=monitor"],
    ["monitor", "/monitor", "section=analysis"],
    ["monitor", "/monitor", "section=audit"],
    ["settings", "/monitor", "section=dashboard"],
    ["forbidden", "/404", ""],
  ]) {
    const guardedWorkspaceRoute = isFloatingAiGuardedWorkspaceRoute(activePage!, location!, search);
    assert.equal(guardedWorkspaceRoute, false, activePage + ":" + location + "?" + search);
    assert.equal(shouldTrackFloatingAiDom({ ...idle, guardedWorkspaceRoute }), false);
  }
});

test("shouldKeepFloatingAiPanelMounted stays mounted while AI is still processing in the background", () => {
  assert.equal(
    shouldKeepFloatingAiPanelMounted({
      hasActivated: true,
      isOpen: false,
      isThinking: true,
      aiStatus: "PROCESSING",
    }),
    true,
  );
});

test("shouldKeepFloatingAiPanelMounted unmounts once minimized idle state is restored", () => {
  assert.equal(
    shouldKeepFloatingAiPanelMounted({
      hasActivated: true,
      isOpen: false,
      isThinking: false,
      aiStatus: "IDLE",
    }),
    false,
  );
});

test("shouldTrackFloatingAiDom only stays aggressive while the AI is visible or active", () => {
  assert.equal(
    shouldTrackFloatingAiDom({
      isOpen: false,
      isThinking: false,
      aiStatus: "IDLE",
    }),
    false,
  );

  assert.equal(
    shouldTrackFloatingAiDom({
      isOpen: true,
      isThinking: false,
      aiStatus: "IDLE",
    }),
    true,
  );

  assert.equal(
    shouldTrackFloatingAiDom({
      isOpen: false,
      isThinking: true,
      aiStatus: "PROCESSING",
    }),
    true,
  );
});

test("idle obstacle tracking is enabled for save collection routes without widening other route prefixes", () => {
  for (const location of ["/collection/save", "/collection/save/", "/COLLECTION/SAVE?source=fixture#entry", "/collection", "/collection-report"]) {
    const saveCollectionRoute = isFloatingAiSaveCollectionRoute("collection-report", location);
    assert.equal(saveCollectionRoute, true, location);
    assert.equal(shouldTrackFloatingAiDom({ isOpen: false, isThinking: false, aiStatus: "IDLE", saveCollectionRoute }), true);
  }
  for (const location of ["/collection/records", "/collection/daily", "/collection/save-other", "/collections/save", "/general-search"]) {
    const saveCollectionRoute = isFloatingAiSaveCollectionRoute("collection-report", location);
    assert.equal(saveCollectionRoute, false, location);
    assert.equal(shouldTrackFloatingAiDom({ isOpen: false, isThinking: false, aiStatus: "IDLE", saveCollectionRoute }), false);
  }
  assert.equal(isFloatingAiSaveCollectionRoute("settings", "/collection/save"), false);
});

test("idle Saved obstacle tracking is restricted to the exact mobile route", () => {
  const idle = { isOpen: false, isThinking: false, aiStatus: "IDLE" as const };
  for (const location of ["/saved", "/saved/", "/saved///", "/SAVED?search=fixture#files"]) {
    const savedMobileRoute = isFloatingAiSavedMobileRoute("saved", location, true);
    assert.equal(savedMobileRoute, true, location);
    assert.equal(shouldTrackFloatingAiDom({ ...idle, savedMobileRoute }), true, location);
  }
  for (const location of ["/saved-other", "/saved/123", "/settings/saved", "/viewer", "/"]) {
    const savedMobileRoute = isFloatingAiSavedMobileRoute("saved", location, true);
    assert.equal(savedMobileRoute, false, location);
    assert.equal(shouldTrackFloatingAiDom({ ...idle, savedMobileRoute }), false, location);
  }
});

test("Saved mobile tracking does not change desktop or unrelated active pages", () => {
  const idle = { isOpen: false, isThinking: false, aiStatus: "IDLE" as const };
  for (const [activePage, location, isMobile] of [
    ["saved", "/saved", false],
    ["saved", "/saved?search=fixture", false],
    ["settings", "/saved", true],
    ["viewer", "/saved", true],
  ] as const) {
    const savedMobileRoute = isFloatingAiSavedMobileRoute(activePage, location, isMobile);
    assert.equal(savedMobileRoute, false, `${activePage}:${location}:${isMobile}`);
    assert.equal(shouldTrackFloatingAiDom({ ...idle, savedMobileRoute }), false);
    assert.equal(shouldTrackFloatingAiDom({ ...idle, savedMobileRoute, isOpen: true }), true);
  }
  assert.equal(shouldTrackFloatingAiDom(idle), false);
});
