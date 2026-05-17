import assert from "node:assert/strict";
import test from "node:test";
import { buildSaveCollectionValidationFailure } from "../save-collection-submit-feedback";
import { buildSaveCollectionProgressSteps } from "../save-collection-submit-progress";

test("buildSaveCollectionProgressSteps highlights request processing with receipts", () => {
  const steps = buildSaveCollectionProgressSteps({
    phase: "processing",
    receiptCount: 2,
    failure: null,
  });

  assert.equal(steps.find((step) => step.id === "validate")?.state, "complete");
  assert.equal(steps.find((step) => step.id === "upload")?.state, "active");
  assert.equal(steps.find((step) => step.id === "scan")?.state, "active");
  assert.equal(steps.find((step) => step.id === "save")?.state, "active");
});

test("buildSaveCollectionProgressSteps marks validation failure on validation step only", () => {
  const failure = buildSaveCollectionValidationFailure({
    message: "Customer Name is required.",
    receiptCount: 1,
  });
  const steps = buildSaveCollectionProgressSteps({
    phase: "failed",
    receiptCount: 1,
    failure,
  });

  assert.equal(steps.find((step) => step.id === "validate")?.state, "failed");
  assert.equal(steps.find((step) => step.id === "upload")?.state, "pending");
});

test("buildSaveCollectionProgressSteps treats missing receipts as skipped after processing starts", () => {
  const steps = buildSaveCollectionProgressSteps({
    phase: "processing",
    receiptCount: 0,
    failure: null,
  });

  assert.equal(steps.find((step) => step.id === "upload")?.state, "complete");
  assert.equal(steps.find((step) => step.id === "scan")?.state, "complete");
  assert.match(steps.find((step) => step.id === "upload")?.description || "", /Tiada receipt/i);
});
