import assert from "node:assert/strict";
import test from "node:test";
import { createElement, createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SingleImportPanel } from "@/pages/import/SingleImportPanel";
import {
  getPreviousSingleImportStep,
  isSingleImportStepAvailable,
  reconcileSingleImportStep,
  resolveInitialSingleImportStep,
  type SingleImportWorkflowState,
} from "@/pages/import/single-import-workflow";
import type { ImportBackgroundJobContract } from "@/pages/import/types";

const emptyState: SingleImportWorkflowState = {
  hasFile: false,
  hasReviewData: false,
  hasColumnMapping: false,
  hasBackgroundJob: false,
  loading: false,
};

function buildJob(status: ImportBackgroundJobContract["status"]): ImportBackgroundJobContract {
  return {
    id: "synthetic-recovery-job",
    status,
    name: "Restored audit dataset",
    filename: "restored-audit.csv",
    progress: status === "completed" ? 100 : 40,
    rowCount: 20,
    importId: status === "completed" ? "synthetic-import" : null,
    duplicateImportName: null,
    error: status === "failed" ? "Synthetic import interruption" : null,
    canCancel: status === "queued" || status === "running",
    canResume: status === "cancelled" || status === "failed",
  };
}

function renderPanel(overrides: Partial<ComponentProps<typeof SingleImportPanel>> = {}) {
  return renderToStaticMarkup(createElement(SingleImportPanel, {
    error: "",
    file: null,
    fileInputRef: createRef<HTMLInputElement>(),
    headers: [],
    importName: "",
    loading: false,
    maxUploadSizeLabel: "10 MB",
    onClear: () => undefined,
    onDrop: () => undefined,
    onDragOver: () => undefined,
    onFileChange: () => undefined,
    onImportNameChange: () => undefined,
    onSave: () => undefined,
    parsedData: [],
    previewDeferred: false,
    columnMapping: [],
    backgroundJob: null,
    onColumnMappingChange: () => undefined,
    onCancelBackgroundJob: () => undefined,
    onResumeBackgroundJob: () => undefined,
    ...overrides,
  }));
}

test("restored jobs remain on their available status step after the asynchronous restore effect", () => {
  for (const status of ["queued", "running", "cancelled", "failed", "completed", "duplicate"] as const) {
    const job = buildJob(status);
    const state = { ...emptyState, hasBackgroundJob: Boolean(job) };
    assert.equal(resolveInitialSingleImportStep(state), 4, status);
    assert.equal(reconcileSingleImportStep(1, state), 4, status);
    assert.equal(reconcileSingleImportStep(4, state), 4, status);
    assert.equal(isSingleImportStepAvailable(4, state), true, status);
    assert.equal(isSingleImportStepAvailable(2, state), false, status);
    assert.equal(isSingleImportStepAvailable(3, state), false, status);
    assert.equal(getPreviousSingleImportStep(4, state), 1, status);
  }
});

test("new imports still require an original file and validated review before later steps", () => {
  assert.equal(resolveInitialSingleImportStep(emptyState), 1);
  assert.equal(reconcileSingleImportStep(4, emptyState), 1);
  assert.equal(isSingleImportStepAvailable(1, emptyState), true);
  for (const step of [2, 3, 4] as const) assert.equal(isSingleImportStepAvailable(step, emptyState), false);

  const fileOnly = { ...emptyState, hasFile: true };
  assert.equal(isSingleImportStepAvailable(4, fileOnly), false);
  const reviewed = { ...fileOnly, hasReviewData: true, hasColumnMapping: true };
  assert.equal(reconcileSingleImportStep(1, reviewed), 2);
  assert.equal(resolveInitialSingleImportStep(reviewed), 3);
  assert.equal(getPreviousSingleImportStep(4, reviewed), 3);
  assert.equal(getPreviousSingleImportStep(3, reviewed), 2);
  assert.equal(isSingleImportStepAvailable(4, reviewed), true);
});

test("restored status and authoritative action eligibility render without the original File", () => {
  for (const status of ["queued", "running", "cancelled", "failed", "completed", "duplicate"] as const) {
    const job = buildJob(status);
    const markup = renderPanel({ backgroundJob: job });
    assert.match(markup, /aria-label="Step 4: Run import"[^>]*|aria-label="Step 4: Run import"/);
    assert.match(markup, /aria-label="Background import progress"/);
    assert.match(markup, /Restored audit dataset/);
    assert.match(markup, /restored-audit.csv/);
    assert.doesNotMatch(markup, /Choose the source file/);
    assert.equal(/>Resume<|>\s*Resume\s*</.test(markup), job.canResume, status);
    assert.equal(/>Cancel<|>\s*Cancel\s*</.test(markup), job.canCancel, status);
    assert.doesNotMatch(markup, /data-testid="button-save"/);
  }
});

test("resuming a restored job disables its Resume action while leaving status visible", () => {
  const markup = renderPanel({ backgroundJob: buildJob("cancelled"), loading: true });
  assert.match(markup, /<button[^>]*disabled=""[^>]*>[\s\S]*?Resume/);
  assert.match(markup, /aria-label="Background import progress"/);
});

test("the empty new-import form keeps Continue disabled", () => {
  const markup = renderPanel();
  assert.match(markup, /Choose the source file/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*data-testid="button-import-next"/);
  assert.doesNotMatch(markup, /aria-label="Background import progress"/);
});
