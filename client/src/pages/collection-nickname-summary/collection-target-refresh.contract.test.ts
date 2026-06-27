import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("saving a Collection Daily target invalidates nickname summaries with bounded listener cleanup", () => {
  const mutationSource = readSource("../collection/useCollectionDailyMutationState.ts");
  const summarySource = readSource("./useCollectionNicknameSummaryData.ts");
  const utilsSource = readSource("../collection/utils.ts");

  assert.match(utilsSource, /COLLECTION_TARGET_CHANGED_EVENT = "collection:target-changed"/);
  assert.match(utilsSource, /window\.dispatchEvent\(new Event\(COLLECTION_TARGET_CHANGED_EVENT\)\)/);
  assert.match(
    mutationSource,
    /await setCollectionDailyTarget\([\s\S]*?emitCollectionTargetChanged\(\)/,
  );
  assert.match(
    summarySource,
    /window\.addEventListener\(COLLECTION_TARGET_CHANGED_EVENT, handleCollectionDataChanged, \{\s*signal: eventListenerController\.signal,\s*\}\)/s,
  );
  assert.match(summarySource, /eventListenerController\.abort\(\)/);
  assert.doesNotMatch(
    summarySource,
    /window\.addEventListener\(COLLECTION_TARGET_CHANGED_EVENT, handleCollectionDataChanged\);/,
  );
});
