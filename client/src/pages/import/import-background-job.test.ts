import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isImportBackgroundJobTerminal,
  waitForImportJobCompletion,
} from "@/pages/import/import-background-job";
import type { ImportBackgroundJobContract } from "@/pages/import/types";

function buildImportJob(
  overrides: Partial<ImportBackgroundJobContract> = {},
): ImportBackgroundJobContract {
  return {
    id: "job-1",
    status: "completed",
    name: "June Import",
    filename: "june.csv",
    progress: 100,
    rowCount: 10,
    importId: "import-1",
    duplicateImportName: null,
    error: null,
    canCancel: false,
    canResume: false,
    ...overrides,
  };
}

test("waitForImportJobCompletion rejects before UI updates when already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  let updateCount = 0;

  await assert.rejects(
    () => waitForImportJobCompletion(
      buildImportJob(),
      controller.signal,
      () => {
        updateCount += 1;
      },
    ),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );

  assert.equal(updateCount, 0);
});

test("waitForImportJobCompletion returns terminal jobs and publishes one update", async () => {
  const job = buildImportJob();
  const updates: ImportBackgroundJobContract[] = [];

  const result = await waitForImportJobCompletion(
    job,
    new AbortController().signal,
    (nextJob) => updates.push(nextJob),
  );

  assert.equal(result, job);
  assert.deepEqual(updates, [job]);
  assert.equal(isImportBackgroundJobTerminal(job), true);
});

test("import background polling checks abort state after each job fetch before updating", () => {
  const source = readFileSync(new URL("./import-background-job.ts", import.meta.url), "utf8");

  assert.match(
    source,
    /currentJob = await getImportJob\(currentJob\.id, \{ signal \}\);\s*assertImportPollingOpen\(signal\);\s*onUpdate\(currentJob\);/s,
  );
});
