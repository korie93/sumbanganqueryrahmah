import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(relativePath: string) {
  return readFile(new URL(`./${relativePath}`, import.meta.url), "utf8");
}

test("Saved exposes source configuration only through its superuser boundary", async () => {
  const [page, card, provider, state] = await Promise.all([
    readSource("../Saved.tsx"),
    readSource("SavedImportCard.tsx"),
    readSource("SavedSourceConfigProvider.tsx"),
    readSource("useSavedSourceConfigState.ts"),
  ]);

  assert.match(page, /SavedSourceConfigProvider enabled=\{state\.isSuperuser\}/);
  assert.match(card, /isSuperuser \? <SavedSourceConfigCardControl/);
  assert.match(provider, /\{enabled \? \(/);
  assert.match(state, /if \(!enabled\) \{/);
  assert.match(state, /getCollectionSourceConfigs\(\{ signal: controller\.signal \}\)/);
  assert.doesNotMatch(card, /compatibilityIssues/);
});

test("source configuration dialog keeps mobile layout and accessible field relationships", async () => {
  const dialog = await readSource("SavedSourceConfigDialog.tsx");

  assert.match(dialog, /<DialogTitle>Configure Collection Source<\/DialogTitle>/);
  assert.match(dialog, /<DialogDescription>/);
  assert.match(dialog, /className="gap-5 sm:max-w-xl"/);
  assert.match(dialog, /htmlFor="saved-source-valid-from"/);
  assert.match(dialog, /id="saved-source-valid-from"\s+type="date"/);
  assert.match(dialog, /htmlFor="saved-source-valid-to"/);
  assert.match(dialog, /id="saved-source-valid-to"\s+type="date"/);
  assert.match(dialog, /htmlFor="saved-source-enabled"/);
  assert.match(dialog, /aria-describedby="saved-source-enabled-help"/);
  assert.match(dialog, /aria-describedby=\{formError \? "saved-source-config-error"/);
  assert.match(dialog, /\.\.\.getAriaInvalidProps\(Boolean\(formError\)\)/);
  assert.match(dialog, /role="alert"/);
  assert.match(dialog, /className="w-full sm:w-auto"/);
  assert.match(dialog, /<AlertDialog/);
  assert.match(dialog, /The Saved file itself is not deleted\./);
  assert.doesNotMatch(dialog, /compatibilityIssues/);
});

test("source configuration client uses bounded schemas and encoded mutation routes", async () => {
  const api = await readSource("../../lib/api/collection-source-configs.ts");

  assert.match(api, /sourceConfigsEndpoint = "\/api\/collection\/source-configs"/);
  assert.match(api, /apiRequest\("GET", sourceConfigsEndpoint/);
  assert.match(api, /"PUT"[\s\S]*encodeURIComponent\(sourceImportId\)/);
  assert.match(api, /"DELETE"[\s\S]*encodeURIComponent\(sourceImportId\)/);
  assert.match(api, /z\.literal\(true\)/);
  assert.match(api, /indexedRowCount: z\.number\(\)\.int\(\)\.nonnegative\(\)/);
});
