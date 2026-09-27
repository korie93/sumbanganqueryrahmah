import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createSettingsCategorySelectionResolver } from "./settings-controller-utils";
import type { SettingCategory } from "./types";

const category = (id: string): SettingCategory => ({ id, name: id, description: null, settings: [] });
const sidebarCategories = [category("general"), category("roles"), category("security")];

test("an initial General request does not pin subsequent Roles and Security clicks", () => {
  const resolve = createSettingsCategorySelectionResolver();
  assert.equal(resolve({ initialSectionId: "general", selectedCategory: "", sidebarCategories }), "general");
  assert.equal(resolve({ initialSectionId: "general", selectedCategory: "general", sidebarCategories }), null);
  assert.equal(resolve({ initialSectionId: "general", selectedCategory: "roles", sidebarCategories }), null);
  assert.equal(resolve({ initialSectionId: "general", selectedCategory: "security", sidebarCategories }), null);
});

test("a requested category remains pending until asynchronously loaded categories include it", () => {
  const resolve = createSettingsCategorySelectionResolver();
  assert.equal(resolve({ initialSectionId: "security", selectedCategory: "", sidebarCategories: [] }), null);
  assert.equal(resolve({ initialSectionId: "security", selectedCategory: "general", sidebarCategories: [category("general")] }), null);
  assert.equal(resolve({ initialSectionId: "security", selectedCategory: "general", sidebarCategories }), "security");
  assert.equal(resolve({ initialSectionId: "security", selectedCategory: "roles", sidebarCategories }), null);
});

for (const requested of ["backup-restore", "account-management"]) {
  test(`${requested} deep link waits for server bootstrap after synthetic categories appear`, () => {
    const resolve = createSettingsCategorySelectionResolver();
    const synthetic = [category("backup-restore"), category("account-management")];
    assert.equal(resolve({ initialSectionId: requested, selectedCategory: "", sidebarCategories: [], ready: false }), null);
    // Profile is now available but the settings request is still in flight.
    assert.equal(resolve({ initialSectionId: requested, selectedCategory: "", sidebarCategories: synthetic, ready: false }), null);
    assert.equal(resolve({ initialSectionId: requested, selectedCategory: requested, sidebarCategories: synthetic, ready: false }), null);
    // loadSettings selects its first server-owned category before settling.
    const loaded = [...sidebarCategories, ...synthetic];
    assert.equal(resolve({ initialSectionId: requested, selectedCategory: "general", sidebarCategories: loaded, ready: false }), null);
    assert.equal(resolve({ initialSectionId: requested, selectedCategory: "general", sidebarCategories: loaded, ready: true }), requested);
    assert.equal(resolve({ initialSectionId: requested, selectedCategory: requested, sidebarCategories: loaded, ready: true }), null);
    // Once initialized, a genuine user choice must not be pinned by the URL.
    assert.equal(resolve({ initialSectionId: requested, selectedCategory: "roles", sidebarCategories: loaded, ready: true }), null);
    assert.equal(resolve({ initialSectionId: requested, selectedCategory: "roles", sidebarCategories: loaded, ready: false }), null);
    assert.equal(resolve({ initialSectionId: requested, selectedCategory: "roles", sidebarCategories: loaded, ready: true }), null);
  });
}

test("initial requests already selected count as applied and do not replay on category refresh", () => {
  const resolve = createSettingsCategorySelectionResolver();
  assert.equal(resolve({ initialSectionId: "security", selectedCategory: "security", sidebarCategories }), null);
  assert.equal(resolve({ initialSectionId: "security", selectedCategory: "roles", sidebarCategories: [...sidebarCategories] }), null);
});

test("changed requests are honored once and a later request for an earlier section can apply again", () => {
  const resolve = createSettingsCategorySelectionResolver();
  assert.equal(resolve({ initialSectionId: "general", selectedCategory: "general", sidebarCategories }), null);
  assert.equal(resolve({ initialSectionId: "roles", selectedCategory: "general", sidebarCategories }), "roles");
  assert.equal(resolve({ initialSectionId: "roles", selectedCategory: "security", sidebarCategories }), null);
  assert.equal(resolve({ initialSectionId: "general", selectedCategory: "security", sidebarCategories }), "general");
  assert.equal(resolve({ selectedCategory: "roles", sidebarCategories }), null);
  assert.equal(resolve({ initialSectionId: "general", selectedCategory: "roles", sidebarCategories }), "general");
});

test("a new unavailable request does not prevent a subsequent earlier valid request", () => {
  const resolve = createSettingsCategorySelectionResolver();
  assert.equal(resolve({ initialSectionId: "general", selectedCategory: "general", sidebarCategories }), null);
  assert.equal(resolve({ initialSectionId: "not-allowed", selectedCategory: "roles", sidebarCategories }), null);
  assert.equal(resolve({ initialSectionId: "general", selectedCategory: "roles", sidebarCategories }), "general");
});

test("removed categories fall back to an available category without resurrecting a consumed request", () => {
  const resolve = createSettingsCategorySelectionResolver();
  assert.equal(resolve({ initialSectionId: "security", selectedCategory: "general", sidebarCategories }), "security");
  assert.equal(resolve({ initialSectionId: "security", selectedCategory: "roles", sidebarCategories: [category("general"), category("security")] }), "general");
  assert.equal(resolve({ initialSectionId: "security", selectedCategory: "security", sidebarCategories: [category("general")] }), "general");
  assert.equal(resolve({ initialSectionId: "security", selectedCategory: "security", sidebarCategories: [] }), null);
});

test("selection resolver state is isolated per mounted Settings instance", () => {
  const first = createSettingsCategorySelectionResolver();
  const second = createSettingsCategorySelectionResolver();
  first({ initialSectionId: "security", selectedCategory: "security", sidebarCategories });
  assert.equal(first({ initialSectionId: "security", selectedCategory: "roles", sidebarCategories }), null);
  assert.equal(second({ initialSectionId: "security", selectedCategory: "roles", sidebarCategories }), "security");
});

test("Settings sync retains one resolver per hook instance and keeps selection updates effect-only", () => {
  const source = readFileSync(new URL("./useSettingsCategorySelectionSync.ts", import.meta.url), "utf8");
  assert.match(source, /selectionResolverRef = useRef/);
  assert.match(source, /useEffect\(\(\) => \{\s*selectionResolverRef\.current \?\?= createSettingsCategorySelectionResolver\(\)/);
  assert.match(source, /const nextCategory = selectionResolverRef\.current\(/);
  assert.match(source, /if \(nextCategory\) \{\s*setSelectedCategory\(nextCategory\)/);
  assert.match(source, /ready: boolean/);
  assert.match(source, /initialSectionId,\s+ready,/);
  assert.match(source, /\[initialSectionId, ready, selectedCategory,/);
  const controller = readFileSync(new URL("./useSettingsController.tsx", import.meta.url), "utf8");
  assert.match(controller, /useSettingsCategorySelectionSync\(\{\s+initialSectionId,\s+ready: !profileLoading && !loading,/);
});
