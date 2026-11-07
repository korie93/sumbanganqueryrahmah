export type AIChatFailedQuery = {
  text: string;
  sessionId: number;
};

type FailureDetails = {
  status: number | null;
  retryAfter: string | null;
  gateNotice: string | null;
  timedOut: boolean;
};

/** Manual recovery is offered only for transient failures, never server gates. */
export function isRetryableAIChatFailure(error: unknown, details: FailureDetails): boolean {
  if (details.gateNotice || details.retryAfter?.trim()) return false;
  if (details.status !== null) {
    return [408, 500, 502, 503, 504].includes(details.status)
      || (details.timedOut && details.status >= 200 && details.status < 300);
  }
  return details.timedOut || error instanceof TypeError;
}

/** Consume before starting a request, so two clicks cannot resend the same failure. */
export function takeAIChatFailedQuery(
  failedQueryRef: { current: AIChatFailedQuery | null },
  sessionId: number,
  isMounted: boolean,
  isProcessing: boolean,
): string | null {
  if (!isMounted || isProcessing) return null;
  const failed = failedQueryRef.current;
  failedQueryRef.current = null;
  if (!failed || failed.sessionId !== sessionId) return null;
  return failed.text;
}
