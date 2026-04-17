export const RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE = 1008;
export const RUNTIME_WS_CLOSE_REASON_SESSION_INVALID = "session_invalid";
export const RUNTIME_WS_CLOSE_REASON_SESSION_EXPIRED = "session_expired";

export type RuntimeWebSocketAuthCloseReason =
  | typeof RUNTIME_WS_CLOSE_REASON_SESSION_INVALID
  | typeof RUNTIME_WS_CLOSE_REASON_SESSION_EXPIRED;
