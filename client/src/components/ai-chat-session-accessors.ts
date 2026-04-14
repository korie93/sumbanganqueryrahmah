import {
  canApplyAIChatUiUpdate,
  canRetryAIChatRequest,
  isActiveAIChatSession,
} from "./ai-chat-session-guards";

type RefLike<T> = {
  current: T;
};

export function createAIChatSessionAccessors(
  sessionRef: RefLike<number>,
  isMountedRef: RefLike<boolean>,
  processingRef: RefLike<boolean>,
) {
  return {
    canApplyUiUpdate(sessionId: number) {
      return canApplyAIChatUiUpdate(sessionId, sessionRef, isMountedRef);
    },
    canRetryRequest(sessionId: number) {
      return canRetryAIChatRequest(sessionId, sessionRef, isMountedRef, processingRef);
    },
    isActiveSession(sessionId: number) {
      return isActiveAIChatSession(sessionId, sessionRef);
    },
  };
}
