import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const savedModuleFiles = [
  "../Saved.tsx",
  "SavedImportsList.tsx",
  "SavedImportCard.tsx",
  "SavedImportDetailPanel.tsx",
  "SavedImportsWorkspace.tsx",
  "SavedWorkspacePanel.tsx",
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

test("saved page wires compact workspace navigation and detail panel", async () => {
  const savedPage = await readSavedSource("../Saved.tsx");
  const workspace = await readSavedSource("SavedImportsWorkspace.tsx");
  const importCard = await readSavedSource("SavedImportCard.tsx");

  assert.match(savedPage, /SavedImportsWorkspace/);
  assert.match(workspace, /SavedWorkspacePanel/);
  assert.match(workspace, /SavedImportDetailPanel/);
  assert.match(workspace, /onWorkspaceViewChange/);
  assert.match(importCard, /button-select-import-/);
  assert.match(importCard, /onClick=\{\(\) => onInspect\(item\)\}/);
  assert.match(importCard, /if \(checked\) \{\s*onInspect\(item\);/);
});
