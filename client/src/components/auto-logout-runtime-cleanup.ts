import type { MutableRefObject } from "react";

type CleanupAutoLogoutRuntimeResourcesArgs = {
  clearHeartbeat: () => void;
  clearHeartbeatRequest: () => void;
  clearIdleTimeout: () => void;
  clearReconnect: () => void;
  cleanupSocket: () => void;
  reconnectAttemptRef: MutableRefObject<number>;
  reconnectEnabledRef: MutableRefObject<boolean>;
};

export function cleanupAutoLogoutRuntimeResources({
  clearHeartbeat,
  clearHeartbeatRequest,
  clearIdleTimeout,
  clearReconnect,
  cleanupSocket,
  reconnectAttemptRef,
  reconnectEnabledRef,
}: CleanupAutoLogoutRuntimeResourcesArgs) {
  reconnectEnabledRef.current = false;
  reconnectAttemptRef.current = 0;
  clearIdleTimeout();
  clearHeartbeat();
  clearReconnect();
  clearHeartbeatRequest();
  cleanupSocket();
}
