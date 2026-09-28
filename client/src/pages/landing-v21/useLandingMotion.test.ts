import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("./useLandingMotion.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function fixture(options: { cores?: number; memory?: number; reduced?: boolean; touch?: boolean; lowSpec?: boolean; saveData?: boolean; effectiveType?: string } = {}) {
  let state: { reduced: boolean; lowSpec: boolean; hidden: boolean; touch: boolean };
  let effect: (() => void | (() => void)) | undefined;
  const listeners = new Map<string, () => void>();
  const makeMedia = (matches: boolean, name: string) => ({
    matches,
    addEventListener(_event: string, callback: () => void) { listeners.set(name, callback); },
    removeEventListener(_event: string, callback: () => void) { assert.equal(listeners.get(name), callback); listeners.delete(name); },
  });
  const reduced = makeMedia(options.reduced ?? false, "motion");
  const pointer = makeMedia(options.touch ?? false, "pointer");
  const document = {
    hidden: false,
    documentElement: { classList: { contains: () => false } },
    addEventListener(name: string, callback: () => void) { listeners.set(name, callback); },
    removeEventListener(name: string, callback: () => void) { assert.equal(listeners.get(name), callback); listeners.delete(name); },
  };
  const exports: { useLandingMotion?: () => typeof state & { paused: boolean } } = {};
  runInNewContext(code, {
    exports, document,
    window: { matchMedia: (query: string) => query.includes("reduced-motion") ? reduced : pointer },
    navigator: { hardwareConcurrency: options.cores ?? 8, deviceMemory: options.memory ?? 8,
      connection: { saveData: options.saveData ?? false, effectiveType: options.effectiveType ?? "4g" } },
    require(name: string) {
      if (name === "react") return {
        useState(initial: () => typeof state) {
          state ??= initial();
          return [state, (update: (previous: typeof state) => typeof state) => { state = update(state); }];
        },
        useEffect(callback: typeof effect) { effect = callback; },
      };
      assert.equal(name, "@/lib/low-spec-mode");
      return { detectLowSpecMode: () => options.lowSpec ?? false };
    },
  });
  return { render: () => exports.useLandingMotion!(), mount: () => effect!(), getState: () => state, document, reduced, pointer, listeners };
}

test("landing motion starts from actual preferences and skips unchanged mount updates", () => {
  const page = fixture();
  assert.deepEqual({ ...page.render() }, { reduced: false, lowSpec: false, hidden: false, touch: false, paused: false });
  const initial = page.getState();
  const cleanup = page.mount();
  assert.equal(page.getState(), initial, "No immediate rerender or root CSS class flip");
  page.document.hidden = true;
  page.listeners.get("visibilitychange")!();
  assert.equal(page.render().paused, true);
  page.document.hidden = false;
  page.reduced.matches = true;
  page.listeners.get("motion")!();
  assert.equal(page.render().reduced, true);
  page.pointer.matches = true;
  page.listeners.get("pointer")!();
  assert.equal(page.render().touch, true);
  assert.equal(typeof cleanup, "function");
  if (cleanup) cleanup();
  assert.equal(page.listeners.size, 0);
});

test("first-render motion still respects all existing low-spec and reduced-motion signals", () => {
  for (const options of [{ cores: 4 }, { memory: 4 }, { lowSpec: true }, { saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }]) {
    const value = fixture(options).render();
    assert.equal(value.lowSpec, true, JSON.stringify(options));
    assert.equal(value.paused, true);
  }
  const reduced = fixture({ reduced: true, touch: true }).render();
  assert.equal(reduced.reduced, true);
  assert.equal(reduced.touch, true);
  assert.equal(reduced.paused, true);
});
