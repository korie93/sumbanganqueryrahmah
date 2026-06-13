import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeViewerAnalysisHandoff,
  storeViewerAnalysisSelection,
  VIEWER_ANALYSIS_HANDOFF_STORAGE_KEY,
} from "@/pages/viewer/analysis-handoff";

function createStorage(failOnSetKey?: string) {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === failOnSetKey) {
        throw new Error("Storage write failed");
      }
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    has: (key: string) => values.has(key),
  };
}

test("analysis Viewer handoff stores the import and is consumed once", () => {
  const local = createStorage();
  const session = createStorage();

  assert.equal(
    storeViewerAnalysisSelection(local, session, {
      importId: "import-1",
      importName: "June Import",
      focusColumn: "Account No",
    }),
    true,
  );
  assert.equal(local.getItem("selectedImportId"), "import-1");
  assert.equal(local.getItem("selectedImportName"), "June Import");
  assert.deepEqual(consumeViewerAnalysisHandoff(session), {
    focusColumn: "Account No",
  });
  assert.equal(session.has(VIEWER_ANALYSIS_HANDOFF_STORAGE_KEY), false);
  assert.equal(consumeViewerAnalysisHandoff(session), null);
});

test("analysis Viewer handoff rejects malformed or empty values", () => {
  const local = createStorage();
  const session = createStorage();

  assert.equal(
    storeViewerAnalysisSelection(local, session, {
      importId: "import-1",
      importName: "June Import",
    }),
    false,
  );

  session.setItem(VIEWER_ANALYSIS_HANDOFF_STORAGE_KEY, "{bad-json");
  assert.equal(consumeViewerAnalysisHandoff(session), null);
  assert.equal(session.has(VIEWER_ANALYSIS_HANDOFF_STORAGE_KEY), false);
});

test("analysis Viewer handoff restores previous selection when storage fails", () => {
  const local = createStorage();
  const session = createStorage(VIEWER_ANALYSIS_HANDOFF_STORAGE_KEY);
  local.setItem("selectedImportId", "import-previous");
  local.setItem("selectedImportName", "Previous Import");

  assert.equal(
    storeViewerAnalysisSelection(local, session, {
      importId: "import-1",
      importName: "June Import",
      search: "duplicate-value",
    }),
    false,
  );
  assert.equal(local.getItem("selectedImportId"), "import-previous");
  assert.equal(local.getItem("selectedImportName"), "Previous Import");
  assert.equal(session.has(VIEWER_ANALYSIS_HANDOFF_STORAGE_KEY), false);
});
