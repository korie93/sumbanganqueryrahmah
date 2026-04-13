type RefLike<T> = {
  current: T;
};

export function isActiveAIChatSession(
  sessionId: number,
  sessionRef: RefLike<number>,
): boolean {
  return sessionId === sessionRef.current;
}

export function canApplyAIChatUiUpdate(
  sessionId: number,
  sessionRef: RefLike<number>,
  isMountedRef: RefLike<boolean>,
): boolean {
  return isActiveAIChatSession(sessionId, sessionRef) && isMountedRef.current;
}

export function canRetryAIChatRequest(
  sessionId: number,
  sessionRef: RefLike<number>,
  isMountedRef: RefLike<boolean>,
  processingRef: RefLike<boolean>,
): boolean {
  return canApplyAIChatUiUpdate(sessionId, sessionRef, isMountedRef) && processingRef.current;
}
