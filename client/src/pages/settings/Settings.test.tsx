import assert from "node:assert/strict";
import test from "node:test";
import { ACTIVE_SETTINGS_SECTION_KEY } from "@/app/constants";
import { resolveRequestedSettingsSection } from "@/pages/settings/settings-section-selection";

test("resolveRequestedSettingsSection prefers the URL section over initial and stored values", () => {
  const storage = {
    getItem(key: string) {
      return key === ACTIVE_SETTINGS_SECTION_KEY ? "backup" : null;
    },
  } as Storage;

  assert.equal(
    resolveRequestedSettingsSection({
      initialSectionId: "security",
      search: "?section=roles",
      storage,
    }),
    "roles",
  );
});

test("resolveRequestedSettingsSection falls back to initial section and then persisted storage", () => {
  const storage = {
    getItem(key: string) {
      return key === ACTIVE_SETTINGS_SECTION_KEY ? "backup" : null;
    },
  } as Storage;

  assert.equal(
    resolveRequestedSettingsSection({
      initialSectionId: "security",
      search: "",
      storage,
    }),
    "security",
  );

  assert.equal(
    resolveRequestedSettingsSection({
      search: "",
      storage,
    }),
    "backup",
  );
});
