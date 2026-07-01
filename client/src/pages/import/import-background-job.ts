import { getImportJob } from "@/lib/api";
import type { ImportBackgroundJobContract } from "@/pages/import/types";

const IMPORT_JOB_POLL_INTERVAL_MS = 1_500;

function createImportPollingAbortError(): DOMException {
  return new DOMException("Import polling was aborted.", "AbortError");
}

function assertImportPollingOpen(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createImportPollingAbortError();
  }
}

export function isImportBackgroundJobTerminal(
  job: ImportBackgroundJobContract,
): boolean {
  return (
    job.status === "completed"
    || job.status === "failed"
    || job.status === "cancelled"
    || job.status === "duplicate"
  );
}

function waitForPollingDelay(signal: AbortSignal): Promise<void> {
  assertImportPollingOpen(signal);

  return new Promise((resolve, reject) => {
    let timeoutId: number | null = null;
    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      signal.removeEventListener("abort", handleAbort);
    };

    function handleAbort() {
      cleanup();
      reject(createImportPollingAbortError());
    }

    timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, IMPORT_JOB_POLL_INTERVAL_MS);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function waitForImportJobCompletion(
  initialJob: ImportBackgroundJobContract,
  signal: AbortSignal,
  onUpdate: (job: ImportBackgroundJobContract) => void,
): Promise<ImportBackgroundJobContract> {
  let currentJob = initialJob;
  assertImportPollingOpen(signal);
  onUpdate(currentJob);

  while (!isImportBackgroundJobTerminal(currentJob)) {
    await waitForPollingDelay(signal);
    currentJob = await getImportJob(currentJob.id, { signal });
    assertImportPollingOpen(signal);
    onUpdate(currentJob);
  }

  return currentJob;
}
