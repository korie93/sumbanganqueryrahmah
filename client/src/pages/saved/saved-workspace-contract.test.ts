import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const savedModuleFiles = [
  "../Saved.tsx",
  "SavedImportsList.tsx",
  "SavedImportCard.tsx",
  "SavedImportDetailDrawer.tsx",
  "SavedImportsWorkspace.tsx",
  "SavedListDensityControl.tsx",
  "SavedWorkspacePanel.tsx",
  "useSavedDataState.ts",
  "useSavedImportDetailState.ts",
  "saved-workspace.ts",
] as const;

async function readSavedSource(relativePath: string) {
  return readFile(new URL(`./${relativePath}`, import.meta.url), "utf8");
}

test("saved workspace keeps page modules split and compact", async () => {
  const lineCounts = await Promise.all(
    savedModuleFiles.map(async (file) => ({
      file,
      lines: (await readSavedSource(file)).split("\n").length,
    })),
  );

  for (const { file, lines } of lineCounts) {
    assert.ok(lines <= 220, `${file} should stay compact, saw ${lines} lines`);
  }
});

test("saved workspace avoids unsafe DOM writes and timer lifecycle risk", async () => {
  const sources = await Promise.all(savedModuleFiles.map(readSavedSource));
  const combined = sources.join("\n");

  assert.doesNotMatch(combined, /dangerouslySetInnerHTML|innerHTML\s*=|insertAdjacentHTML/);
  assert.doesNotMatch(combined, /setInterval|setTimeout|addEventListener/);
});

test("saved page wires server pagination and a compact detail drawer", async () => {
  const savedPage = await readSavedSource("../Saved.tsx");
  const workspace = await readSavedSource("SavedImportsWorkspace.tsx");
  const workspacePanel = await readSavedSource("SavedWorkspacePanel.tsx");
  const importCard = await readSavedSource("SavedImportCard.tsx");
  const workspaceState = await readSavedSource("saved-workspace.ts");

  assert.match(savedPage, /SavedImportsWorkspace/);
  assert.match(workspace, /SavedWorkspacePanel/);
  assert.match(workspace, /SavedImportDetailDrawer/);
  assert.match(workspace, /AppPaginationBar/);
  assert.match(workspace, /onWorkspaceViewChange/);
  assert.doesNotMatch(workspace, /Load more|onLoadMore/);
  assert.match(importCard, /button-select-import-/);
  assert.match(importCard, /onClick=\{\(\) => onInspect\(item\)\}/);
  assert.match(importCard, /if \(checked\) \{\s*onInspect\(item\);/);
  assert.match(workspacePanel, /role="group"/);
  assert.match(workspacePanel, /aria-label="Saved workspace views"/);
  assert.doesNotMatch(workspacePanel, /role="list"/);
  assert.doesNotMatch(workspaceState, /return imports\[0\]\?\.id/);
});

test("saved files use the wide page and a viewport-sized desktop scroll region", async () => {
  const savedPage = await readSavedSource("../Saved.tsx");
  const workspace = await readSavedSource("SavedImportsWorkspace.tsx");
  const importsList = await readSavedSource("SavedImportsList.tsx");
  const importCard = await readSavedSource("SavedImportCard.tsx");

  assert.match(savedPage, /<OperationalPage width="wide">/);
  assert.match(workspace, /xl:grid-cols-\[15rem_minmax\(0,1fr\)\]/);
  assert.match(importsList, /saved-files-scroll-region/);
  assert.match(importsList, /md:max-h-\[clamp\(32rem,calc\(100dvh-20rem\),52rem\)\]/);
  assert.match(importsList, /md:overflow-y-auto/);
  assert.doesNotMatch(importsList, /max-h-\[440px\]/);
  assert.match(importCard, /xl:grid-cols-\[minmax\(0,1fr\)_auto\]/);
});

test("saved file density is user-persisted and comfortable on mobile", async () => {
  const importsList = await readSavedSource("SavedImportsList.tsx");
  const importCard = await readSavedSource("SavedImportCard.tsx");
  const densityControl = await readSavedSource("SavedListDensityControl.tsx");
  const densityState = await readSavedSource("useSavedListDensity.ts");

  assert.match(importsList, /SavedListDensityControl/);
  assert.match(importsList, /density=\{listDensity\.density\}/);
  assert.match(importCard, /data-density=\{density\}/);
  assert.match(densityControl, /aria-label="Saved file density"/);
  assert.match(densityControl, /hidden .*md:flex/);
  assert.match(densityState, /getStoredAuthenticatedUser/);
  assert.match(densityState, /safeSetStorageItem/);
  assert.match(densityState, /isMobile \? "comfortable" : preference/);
  assert.doesNotMatch(densityState, /localStorage\.(getItem|setItem)/);
});

test("saved data state keeps one server page and aborts stale requests", async () => {
  const dataState = await readSavedSource("useSavedDataState.ts");
  const detailState = await readSavedSource("useSavedImportDetailState.ts");

  assert.match(dataState, /page,\s*pageSize/);
  assert.match(dataState, /pagination\.mode !== "offset"/);
  assert.doesNotMatch(dataState, /mergeSavedImportPages/);
  assert.match(dataState, /mountedRef\.current = true/);
  assert.match(dataState, /fetchAbortControllerRef\.current\?\.abort\(\)/);
  assert.match(detailState, /controller\.abort\(\)/);
});
