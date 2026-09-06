import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { assertBillingPrincipalWorkspaceOwner, BillingPrincipalOwnerChangedError } from "./billing-principal-owner";

test("private workspace metadata and saves bind to one stable actor regardless of shared role or assignment", () => {
  assert.doesNotThrow(() => assertBillingPrincipalWorkspaceOwner("owner-a", "owner-a"));
  for (const [expected, actual] of [["owner-a", "owner-b"], ["owner-a", ""], ["", "owner-a"], ["", ""]]) {
    assert.throws(() => assertBillingPrincipalWorkspaceOwner(expected!, actual!), BillingPrincipalOwnerChangedError);
  }
});

test("metadata revalidation checks authenticated owner before deferring a dirty draft", async () => {
  const shell = await readFile(new URL("../pages/collection/BillingPrincipalSavedTargetShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /assertBillingPrincipalWorkspaceOwner\(ownerUserId, viewerUserId\);[\s\S]*if \(!workspaceLocked && !configOpen && !deleting\)/);
  const workspace = await readFile(new URL("../pages/collection/BillingPrincipalSavedTargetWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /await getBillingPrincipalSavedTarget\(target.id,[\s\S]*assertBillingPrincipalWorkspaceOwner\(ownerUserId, latest.viewerUserId\);[\s\S]*await upsertBillingPrincipalClientResults/);
  assert.match(workspace, /expectedViewerUserId: ownerUserId/);
});
