import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewerFilterPresetControl } from "./ViewerFilterPresetControl";
import { buildViewerPresetPayload, getViewerPresetCompatibilityIssue } from "./viewer-preset-utils";
import type { ViewerFilterPresetState } from "./useViewerFilterPresets";
import type { ViewerFilterPreset } from "@shared/common/viewer-filter-presets";
import { getViewerFilterPresets, createViewerFilterPreset, renameViewerFilterPreset, deleteViewerFilterPreset } from "@/lib/api/viewer-presets";

const preset: ViewerFilterPreset = { id: "00112233-4455-4677-8899-aabbccddeeff", name: "Due dates", columnFilters: [
  { column: "Date", operator: "dateBetween", value: "2024-02-28", valueTo: "2024-02-29" },
], numericSort: { column: "Amount", direction: "desc" } };

test("Viewer preset snapshot keeps both bounds and sort but strips ephemeral IDs and shares no draft references", () => {
  const filter = { id: "ephemeral-row", ...preset.columnFilters[0]! };
  const result = buildViewerPresetPayload(" Due dates ", [filter], preset.numericSort, ["Date", "Amount"]);
  assert.ok(result.ok);
  assert.deepEqual(result.payload, { name: preset.name, columnFilters: preset.columnFilters, numericSort: preset.numericSort });
  assert.notEqual(result.payload.columnFilters[0], filter);
  assert.notEqual(result.payload.numericSort, preset.numericSort);
  assert.equal("id" in result.payload.columnFilters[0]!, false);
  filter.valueTo = "2024-03-31";
  assert.equal(result.payload.columnFilters[0]?.valueTo, "2024-02-29");
});

test("Viewer presets reject an entire incomplete or invalid draft instead of silently saving its active subset", () => {
  const valid = preset.columnFilters[0]!;
  for (const invalid of [
    { column: "Amount", operator: "between" as const, value: "10" },
    { column: "Date", operator: "dateBetween" as const, value: "2024-03-01", valueTo: "2024-02-29" },
    { column: "Date", operator: "dateAfter" as const, value: "2023-02-29" },
    { column: "Amount", operator: "contains" as const, value: "   " },
  ]) assert.equal(buildViewerPresetPayload("Incomplete", [valid, invalid], null, ["Date", "Amount"]).ok, false);
  assert.equal(buildViewerPresetPayload("Empty", [], null, ["Date"]).ok, false);
  assert.equal(buildViewerPresetPayload("Sort only", [], { column: "Amount", direction: "asc" }, ["Amount"]).ok, true);
});

test("Viewer preset columns are exact and stale filter or sort columns fail closed", () => {
  assert.equal(buildViewerPresetPayload(preset.name, preset.columnFilters, preset.numericSort, ["date", "Amount"]).ok, false);
  assert.equal(getViewerPresetCompatibilityIssue(preset, ["Date", "Amount"]), null);
  assert.match(getViewerPresetCompatibilityIssue(preset, ["Date"]) ?? "", /column is no longer available/);
  assert.match(getViewerPresetCompatibilityIssue({ ...preset, numericSort: null }, ["Amount"]) ?? "", /column is no longer available/);
});

function state(overrides: Partial<ViewerFilterPresetState> = {}): ViewerFilterPresetState {
  return { scope: '["account-1","import-1"]', presets: [], status: "ready", pending: false, error: "", message: "", available: true,
    reload: () => undefined, create: async () => null, rename: async () => null, remove: async () => null, ...overrides };
}

test("Viewer preset controls expose native selection labels, explicit actions and escaped names", () => {
  const html = renderToStaticMarkup(createElement(ViewerFilterPresetControl, {
    headers: ["Date", "Amount"], columnFilters: preset.columnFilters, numericSort: preset.numericSort,
    state: state({ presets: [{ ...preset, name: '<img src=x onerror="alert(1)">' }] }), onApply: () => true,
  }));
  assert.match(html, /for="viewer-preset-select"/);
  assert.match(html, /<select[^>]*id="viewer-preset-select"[^>]*name="viewerPreset"/);
  assert.match(html, /Choose a preset/);
  assert.match(html, /Save preset/);
  assert.match(html, /button-apply-viewer-preset/);
  assert.match(html, /Private to your account and this file/);
  assert.match(html, /&lt;img src=x/);
  assert.doesNotMatch(html, /<img/);
});

test("Viewer preset loading and failed metadata reads disable saving and expose status and explicit retry", () => {
  const render = (value: ViewerFilterPresetState) => renderToStaticMarkup(createElement(ViewerFilterPresetControl, {
    headers: ["Date", "Amount"], columnFilters: preset.columnFilters, numericSort: preset.numericSort, state: value, onApply: () => true,
  }));
  assert.match(render(state({ status: "loading" })), /Loading your presets/);
  const error = render(state({ status: "error", error: "Could not load your presets." }));
  assert.match(error, /role="alert"/);
  assert.match(error, /button-retry-viewer-presets/);
  assert.match(error, /<button[^>]*disabled=""[^>]*data-testid="button-save-viewer-preset"/);
});

test("Viewer preset API encodes file and preset paths, forwards cancellation and serializes only the validated query snapshot", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  const requests: Array<{ url: string; method: string; body: unknown; signal: AbortSignal | null }> = [];
  globalThis.fetch = (async (url, options) => {
    requests.push({ url: String(url), method: String(options?.method), body: options?.body ? JSON.parse(String(options.body)) : undefined, signal: options?.signal ?? null });
    const method = options?.method;
    return new Response(JSON.stringify(method === "GET" ? { presets: [preset] } : method === "DELETE" ? { ok: true } : { preset }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    await getViewerFilterPresets("file/a?b", { signal: controller.signal });
    await createViewerFilterPreset("file/a?b", { name: preset.name, columnFilters: preset.columnFilters, numericSort: preset.numericSort }, { signal: controller.signal });
    await renameViewerFilterPreset("file/a?b", preset.id, "New name", { signal: controller.signal });
    await deleteViewerFilterPreset("file/a?b", preset.id, { signal: controller.signal });
    assert.equal(requests.length, 4);
    for (const request of requests) {
      assert.match(request.url, /^\/api\/imports\/file%2Fa%3Fb\/viewer-presets/);
      assert.equal(request.signal, controller.signal);
    }
    assert.deepEqual(requests[1]?.body, { name: preset.name, columnFilters: preset.columnFilters, numericSort: preset.numericSort });
    assert.deepEqual(requests[2]?.body, { name: "New name" });
    assert.equal(requests[3]?.method, "DELETE");
    assert.equal(requests[3]?.body, undefined);
  } finally { globalThis.fetch = original; }
});

test("Viewer preset API refuses an invalid response and rejects unknown create fields before any mutation", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => { requests += 1; return new Response(JSON.stringify({ presets: [{ ...preset, numericSort: { column: "Amount", direction: "sideways" } }] }), { status: 200 }); }) as typeof fetch;
  try {
    await assert.rejects(getViewerFilterPresets("import-1"), /API contract mismatch/);
    await assert.rejects(createViewerFilterPreset("import-1", { name: preset.name, columnFilters: preset.columnFilters, numericSort: null, ownerId: "someone-else" } as unknown as Parameters<typeof createViewerFilterPreset>[1]));
    assert.equal(requests, 1);
  } finally { globalThis.fetch = original; }
});
