export const READ_DEADLINE_MS = 60_000;
export const READ_DEADLINE_MESSAGE = "Permintaan mengambil masa terlalu lama. Sila cuba semula.";

/** Identifies an expired full read without confusing it with caller cancellation. */
export class ReadDeadlineError extends Error {
  constructor(readonly timeoutMs = READ_DEADLINE_MS) {
    super(READ_DEADLINE_MESSAGE);
    this.name = "ReadDeadlineError";
  }
}

/** Recognizes only this read deadline's error, not arbitrary response text. */
export function isReadDeadlineError(error: unknown): error is ReadDeadlineError {
  return error instanceof ReadDeadlineError;
}

function cancellationError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** Bounds headers, body parsing and retry waits while preserving the caller's ownership signal. */
export function withReadDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal: AbortSignal,
  timeoutMs = READ_DEADLINE_MS,
): Promise<T> {
  // Do not invoke work or acquire resources for an already-cancelled owner.
  if (callerSignal.aborted) return Promise.reject(cancellationError());

  const controller = new AbortController();
  const duration = Number.isFinite(timeoutMs)
    ? Math.max(1, Math.min(2_147_483_647, Math.trunc(timeoutMs))) : READ_DEADLINE_MS;
  const startedAt = performance.now();
  let rejectTermination: (error: unknown) => void = () => {};
  const termination = new Promise<never>((_resolve, reject) => { rejectTermination = reject; });
  const handleCallerAbort = () => {
    const error = cancellationError();
    rejectTermination(error);
    controller.abort(error);
  };
  callerSignal.addEventListener("abort", handleCallerAbort, { once: true });
  if (callerSignal.aborted) handleCallerAbort();

  const timer = setTimeout(() => {
    const error = new ReadDeadlineError(duration);
    // Settle the deadline first: a cooperative fetch may reject AbortError
    // synchronously when its child signal is aborted.
    rejectTermination(error);
    controller.abort(error);
  }, duration);
  let work: Promise<T>;
  try {
    work = controller.signal.aborted ? termination : Promise.resolve(operation(controller.signal)).then((value) => {
      // A blocked event loop can delay the timer callback. Do not publish a
      // successful result that has already exceeded the full read budget.
      if (performance.now() - startedAt >= duration) {
        const error = new ReadDeadlineError(duration);
        controller.abort(error);
        throw error;
      }
      return value;
    });
  } catch (error) {
    work = Promise.reject(error);
  }

  // Both promises have rejection handlers even if non-cooperative work settles
  // after cancellation. A late resolve/reject cannot change the winning result.
  return Promise.race([termination, work]).finally(() => {
    clearTimeout(timer);
    callerSignal.removeEventListener("abort", handleCallerAbort);
  });
}
