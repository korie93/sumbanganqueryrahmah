import assert from "node:assert/strict";
import test from "node:test";
import { migrateLandingThemePreference } from "./landing-theme-migration";

function store(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

for (const theme of ["light", "dark"]) {
  test(`migrates a legacy ${theme} choice once when no workspace preference exists`, () => {
    const storage = store({ "sqr-landing-next-theme": theme });
    migrateLandingThemePreference(storage);
    assert.equal(storage.getItem("theme"), theme);
    assert.equal(storage.getItem("sqr-landing-next-theme"), null);
    storage.setItem("theme", theme === "dark" ? "light" : "dark");
    migrateLandingThemePreference(storage);
    assert.notEqual(storage.getItem("theme"), theme);
  });

  test(`preserves an existing workspace ${theme} choice over the stale landing preference`, () => {
    const storage = store({ theme, "sqr-landing-next-theme": theme === "dark" ? "light" : "dark" });
    migrateLandingThemePreference(storage);
    assert.equal(storage.getItem("theme"), theme);
    assert.equal(storage.getItem("sqr-landing-next-theme"), null);
  });
}

test("does not invent an explicit preference for a new visitor or invalid legacy values", () => {
  const cases: Record<string, string>[] = [{}, { "sqr-landing-next-theme": "invalid" }];
  for (const values of cases) {
    const storage = store(values);
    migrateLandingThemePreference(storage);
    assert.equal(storage.getItem("theme"), null);
  }
});

test("retains the legacy choice if storage cannot persist its migration", () => {
  const storage = store({ "sqr-landing-next-theme": "dark" });
  storage.setItem = () => { throw new DOMException("Storage unavailable", "QuotaExceededError"); };
  assert.doesNotThrow(() => migrateLandingThemePreference(storage));
  assert.equal(storage.getItem("theme"), null);
  assert.equal(storage.getItem("sqr-landing-next-theme"), "dark");
});

test("blocked storage never stops app initialization", () => {
  const blocked = () => { throw new Error("Storage denied"); };
  assert.doesNotThrow(() => migrateLandingThemePreference({ getItem: blocked, setItem: blocked, removeItem: blocked }));
  assert.doesNotThrow(() => migrateLandingThemePreference(null));
});
