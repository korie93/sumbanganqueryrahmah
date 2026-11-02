import assert from "node:assert/strict";
import test from "node:test";
import { Script } from "node:vm";
import { initializeBrowserThemeFixture } from "../lib/browser-theme-fixture.mjs";

const origin = "http://127.0.0.1:32123";
// Playwright serializes this exact callback, so exercise it without module scope
// as well. Every document gets its own Storage prototype, like a real reload.
const initialize = new Script(`(${initializeBrowserThemeFixture.toString()})(fixtureOptions)`);

function documentHarness(values = new Map(), options = {}, documentOrigin = origin) {
  const writes = [];
  let accesses = 0;
  class FixtureStorage {
    getItem(key) { return values.has(key) ? values.get(key) : null; }
    setItem(key, value) { writes.push([key, String(value)]); values.set(key, String(value)); }
    removeItem(key) { writes.push([key, null]); values.delete(key); }
  }
  const storage = new FixtureStorage();
  const sandbox = {
    URL, DOMException, Storage: FixtureStorage,
    fixtureOptions: { origin, mode: "preserve-choice", theme: "light", ...options },
    location: { origin: documentOrigin },
  };
  sandbox.window = sandbox;
  Object.defineProperty(sandbox, "localStorage", { configurable: true, get() {
    accesses++;
    assert.equal(documentOrigin, origin, "Foreign/opaque documents must not touch storage");
    return storage;
  } });
  return {
    run: () => initialize.runInNewContext(sandbox, { timeout: 1_000 }),
    storage: () => sandbox.localStorage,
    accesses: () => accesses,
    writes,
  };
}

test("preserve-choice seeds a fresh context once and keeps real choices across documents", () => {
  for (const initial of ["light", "dark"]) {
    const values = new Map();
    documentHarness(values, { theme: initial }).run();
    assert.equal(values.get("theme"), initial);
    for (const selected of ["dark", "light", "dark"]) {
      values.set("theme", selected);
      const next = documentHarness(values, { theme: initial });
      next.run();
      assert.equal(values.get("theme"), selected);
      assert.deepEqual(next.writes.filter(([key]) => key === "theme"), []);
    }
  }
});

test("preserve-choice respects an existing canonical preference on the first document", () => {
  for (const selected of ["dark", "light"]) {
    const values = new Map([["theme", selected]]);
    const next = documentHarness(values, { theme: selected === "dark" ? "light" : "dark" });
    next.run();
    assert.equal(values.get("theme"), selected);
    assert.deepEqual(next.writes.filter(([key]) => key === "theme"), []);
  }
});

test("journey fixtures never resurrect a migrated legacy preference or a removed explicit choice", () => {
  const values = new Map();
  const options = { theme: "dark", legacyTheme: "light" };
  documentHarness(values, options).run();
  assert.equal(values.get("theme"), "dark");
  assert.equal(values.get("sqr-landing-next-theme"), "light");
  // The real app migrates/removes the old key, then the user returns to OS mode.
  values.delete("sqr-landing-next-theme");
  values.delete("theme");
  const next = documentHarness(values, options);
  next.run();
  assert.equal(values.has("theme"), false);
  assert.equal(values.has("sqr-landing-next-theme"), false);
  assert.deepEqual(next.writes, []);
});

test("fixed mode deliberately reapplies the requested palette for each visual document", () => {
  const values = new Map([["theme", "dark"]]);
  for (const selected of ["light", "dark", "light"]) {
    const next = documentHarness(values, { mode: "fixed", theme: selected });
    next.run();
    assert.equal(values.get("theme"), selected);
    assert.deepEqual(next.writes, [["theme", selected]]);
  }
});

test("system mode clears both theme keys once and then preserves an explicit user selection", () => {
  const values = new Map([["theme", "dark"], ["sqr-landing-next-theme", "light"]]);
  documentHarness(values, { mode: "system" }).run();
  assert.equal(values.has("theme"), false);
  assert.equal(values.has("sqr-landing-next-theme"), false);
  for (const selected of ["dark", "light"]) {
    values.set("theme", selected);
    const next = documentHarness(values, { mode: "system" });
    next.run();
    assert.equal(values.get("theme"), selected);
    assert.deepEqual(next.writes, []);
  }
});

test("all modes return before storage access for foreign and about:blank documents", () => {
  for (const mode of ["fixed", "preserve-choice", "system"]) {
    for (const documentOrigin of ["https://outside.invalid", "null"]) {
      const values = new Map([["theme", "dark"]]);
      const next = documentHarness(values, { mode, performanceMode: "low" }, documentOrigin);
      next.run();
      assert.equal(next.accesses(), 0);
      assert.deepEqual(next.writes, []);
      assert.deepEqual([...values], [["theme", "dark"]]);
    }
  }
});

test("theme fixtures reject non-loopback or non-origin targets before any storage access", () => {
  for (const target of ["https://sqr-system.com", "http://localhost:32123", "http://127.0.0.1", "https://127.0.0.1:32123", `${origin}/path`, `${origin}?query=1`, `${origin}#fragment`, "http://user@127.0.0.1:32123"]) {
    const next = documentHarness(new Map(), { origin: target });
    assert.throws(() => next.run(), /exact isolated loopback origin/);
    assert.equal(next.accesses(), 0);
  }
});

test("explicit mode, palette, performance and storage-failure values are validated", () => {
  for (const options of [{ mode: "unknown" }, { theme: "sepia" }, { legacyTheme: "sepia" }, { performanceMode: "turbo" }, { storageFailure: "unknown" }]) {
    const next = documentHarness(new Map(), options);
    assert.throws(() => next.run(), /fixture/);
    assert.equal(next.accesses(), 0);
  }
});

test("performance setup runs before a storage fault and never changes the chosen palette", () => {
  for (const mode of ["low", "high", "auto"]) {
    const values = new Map([["theme", "dark"], ["perf_mode", "low"]]);
    const next = documentHarness(values, { performanceMode: mode, storageFailure: "denied-getter" });
    next.run();
    assert.equal(values.get("theme"), "dark");
    assert.equal(values.get("perf_mode"), mode === "auto" ? undefined : mode);
    assert.throws(() => next.storage(), { name: "SecurityError" });
  }
});

test("denied-read affects only canonical theme reads after successful fixture seeding", () => {
  const values = new Map();
  const next = documentHarness(values, { storageFailure: "denied-read" });
  next.run();
  assert.equal(values.get("theme"), "light");
  assert.throws(() => next.storage().getItem("theme"), { name: "SecurityError" });
  next.storage().setItem("unrelated", "available");
  assert.equal(next.storage().getItem("unrelated"), "available");
});

test("quota-write affects only canonical theme writes after successful fixture seeding", () => {
  const values = new Map();
  const next = documentHarness(values, { storageFailure: "quota-write" });
  next.run();
  assert.equal(next.storage().getItem("theme"), "light");
  assert.throws(() => next.storage().setItem("theme", "dark"), { name: "QuotaExceededError" });
  assert.equal(values.get("theme"), "light");
  next.storage().setItem("unrelated", "available");
  assert.equal(next.storage().getItem("unrelated"), "available");
});

test("every fresh document installs storage faults after setup without depending on init-script ordering", () => {
  for (const storageFailure of ["denied-getter", "denied-read", "quota-write"]) {
    const values = new Map([["theme", "dark"], ["sqr-landing-next-theme", "light"]]);
    for (let document = 0; document < 2; document++) {
      const next = documentHarness(values, { mode: "system", performanceMode: "high", storageFailure });
      next.run();
      assert.equal(values.has("theme"), false);
      assert.equal(values.has("sqr-landing-next-theme"), false);
      assert.equal(values.get("perf_mode"), "high");
    }
  }
});
