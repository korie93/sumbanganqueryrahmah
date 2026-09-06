import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { BillingPrincipalSourcePreview, BillingPrincipalTargetOptions } from "@/lib/api/collection-billing-principal";
import { addBillingPrincipalSelectedSource, billingPrincipalPreviewMatchesSources } from "./BillingPrincipalSavedTargetDialog";

const sources: BillingPrincipalTargetOptions["sources"] = Array.from({ length: 6 }, (_, index) => ({
  id: `source-${index + 1}`, name: `Saved source ${index + 1}`, filename: `source-${index + 1}.xlsx`,
  validFrom: "2026-09-01", validTo: "2026-09-30", recordCount: 1, status: "active",
}));
const preview = (ids: string[]): BillingPrincipalSourcePreview => ({
  ok: true, from: "2026-09-01", to: "2026-09-30", sourceImportIds: ids,
  rows: (["D3", "D4", "D5", "D6"] as const).map((aging) => ({ aging, totalOsp: "100.00", accountCount: 1 })),
});

test("source selection retains independent options across searches/pages, rejects duplicates and preserves the existing five-source cap", () => {
  let selected: typeof sources = [];
  for (const source of sources.slice(0, 3)) selected = addBillingPrincipalSelectedSource(selected, source);
  assert.deepEqual(selected, sources.slice(0, 3));
  assert.equal(addBillingPrincipalSelectedSource(selected, sources[0]!), selected);
  assert.equal(billingPrincipalPreviewMatchesSources(preview(selected.map((source) => source.id).reverse()), selected), true);
  const removed = selected.filter((source) => source.id !== sources[1]!.id);
  assert.deepEqual(removed, [sources[0], sources[2]]);
  assert.deepEqual(addBillingPrincipalSelectedSource(removed, sources[1]!), [sources[0], sources[2], sources[1]]);
  for (const source of sources.slice(3)) selected = addBillingPrincipalSelectedSource(selected, source);
  assert.deepEqual(selected, sources.slice(0, 5));
});

test("only a complete authoritative preview of the current selection can enable a create", () => {
  assert.equal(billingPrincipalPreviewMatchesSources(preview([sources[0]!.id]), [sources[0]!]), true);
  const selected = sources.slice(0, 3);
  const ids = selected.map((source) => source.id);
  for (const invalid of [null, preview([]), preview(ids.slice(0, 1)), preview(ids.slice(0, 2)),
    preview([...ids, "extra"]), preview([ids[0]!, ids[1]!, "unknown"]), preview([ids[0]!, ids[0]!, ids[2]!])]) {
    assert.equal(billingPrincipalPreviewMatchesSources(invalid, selected), false);
  }
  assert.equal(billingPrincipalPreviewMatchesSources(preview(ids), []), false);
  assert.equal(billingPrincipalPreviewMatchesSources(preview(ids), [sources[0]!, sources[0]!, sources[2]!]), false);
  assert.equal(billingPrincipalPreviewMatchesSources(preview(sources.map((source) => source.id)), sources), false);
});

test("create form clears selections on account change and fences stale/loading previews without changing frozen-source edit behavior", () => {
  const source = readFileSync(new URL("./BillingPrincipalSavedTargetDialog.tsx", import.meta.url), "utf8");
  assert.match(source, /previewBillingPrincipalSource\(selectedSources\.map\(\(source\) => source\.id\)/);
  assert.match(source, /if \(!target\) \{\s*changeSources\(\[\]\);\s*setSourceSearch\(""\);\s*setSourcePage\(1\);/);
  assert.match(source, /setSelectedSources\(sources\);[\s\S]*?setPreview\(null\);/);
  assert.match(source, /if \(saveRef\.current \|\| !preview \|\| !admin \|\| !sourcePreviewReady \|\| previewLoading/);
  assert.match(source, /sourceImportIds: preview\.sourceImportIds/);
  assert.match(source, /aria-label="Selected configured sources"/);
  assert.match(source, /aria-label=\{`Remove source \$\{item\.name\}`\}/);
  assert.match(source, /target\.activeRevision\.sourceSnapshots\.map/);
  assert.match(source, /const createAdminId = target \? null : admin\?\.id/);
  assert.match(source, /\[selectedSources, createAdminId, target, retry\]/);
  assert.match(source, /Frozen source — create a new target/);
});
