import { getImportJob } from "@/lib/api";
import type { ImportBackgroundJobContract } from "@/pages/import/types";

const IMPORT_JOB_POLL_INTERVAL_MS = 1_500;

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
  if (signal.aborted) {
    return Promise.reject(new DOMException("Import polling was aborted.", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, IMPORT_JOB_POLL_INTERVAL_MS);

    function handleAbort() {
      window.clearTimeout(timeoutId);
      reject(new DOMException("Import polling was aborted.", "AbortError"));
    }

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function waitForImportJobCompletion(
  initialJob: ImportBackgroundJobContract,
  signal: AbortSignal,
  onUpdate: (job: ImportBackgroundJobContract) => void,
): Promise<ImportBackgroundJobContract> {
  let currentJob = initialJob;
  onUpdate(currentJob);

  while (!isImportBackgroundJobTerminal(currentJob)) {
    await waitForPollingDelay(signal);
    currentJob = await getImportJob(currentJob.id, { signal });
    onUpdate(currentJob);
  }

  return currentJob;
}
