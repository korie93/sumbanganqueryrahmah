import { useCallback, useEffect, useRef } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import {
  resolveActivityHeartbeatSyncWindowMs,
  shouldSyncActivityHeartbeat,
} from "@/components/auto-logout-heartbeat-utils";
import {
  persistAuthNotice,
  subscribeForcedLogout,
} from "@/lib/auth-session";
import { sendAutoLogoutHeartbeat } from "@/components/auto-logout-heartbeat-runtime";
import {
  bindAutoLogoutActivityListeners,
  bindAutoLogoutVisibilityChange,
} from "@/components/auto-logout-activity-runtime";
import {
  bindAutoLogoutSocket,
  disposeAutoLogoutSocket,
} from "@/components/auto-logout-socket-runtime";

interface AutoLogoutProps {
  onClientLogout: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  timeoutMinutes?: number;
  heartbeatIntervalMinutes?: number;
  username?: string;
}

export default function AutoLogout({
  onClientLogout,
  onLogout,
  timeoutMinutes = 30,
  heartbeatIntervalMinutes = 5,
  username,
}: AutoLogoutProps) {
  const timeoutRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const heartbeatAbortControllerRef = useRef<AbortController | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const lastResetByEventRef = useRef<number>(0);
  const reconnectAttemptRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const reconnectEnabledRef = useRef(true);
  const logoutStartedRef = useRef(false);
  const lastHeartbeatSyncAtRef = useRef(0);
  const activityListenersAttachedRef = useRef(false);
  const onClientLogoutRef = useLatestRef(onClientLogout);
  const onLogoutRef = useLatestRef(onLogout);

  const timeoutMs = timeoutMinutes * 60 * 1000;
  const heartbeatMs = heartbeatIntervalMinutes * 60 * 1000;
  const heartbeatSyncWindowMs = resolveActivityHeartbeatSyncWindowMs(heartbeatMs);

  const clearIdleTimeout = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const clearReconnect = useCallback(() => {
    if (reconnectRef.current) {
      window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
  }, []);

  const clearHeartbeatRequest = useCallback(() => {
    heartbeatAbortControllerRef.current?.abort();
    heartbeatAbortControllerRef.current = null;
  }, []);

  const cleanupSocket = useCallback(() => {
    clearReconnect();

    disposeAutoLogoutSocket(wsRef.current, wsRef);
  }, [clearReconnect]);

  const runLogout = useCallback(async () => {
    if (logoutStartedRef.current) return;
    logoutStartedRef.current = true;
    reconnectEnabledRef.current = false;
    reconnectAttemptRef.current = 0;
    clearIdleTimeout();
    clearHeartbeat();
    clearHeartbeatRequest();
    cleanupSocket();
    await onLogoutRef.current();
  }, [cleanupSocket, clearHeartbeat, clearHeartbeatRequest, clearIdleTimeout, onLogoutRef]);

  const runClientLogout = useCallback(async () => {
    if (logoutStartedRef.current) return;
    logoutStartedRef.current = true;
    reconnectEnabledRef.current = false;
    reconnectAttemptRef.current = 0;
    clearIdleTimeout();
    clearHeartbeat();
    clearHeartbeatRequest();
    cleanupSocket();
    await onClientLogoutRef.current();
  }, [cleanupSocket, clearHeartbeat, clearHeartbeatRequest, clearIdleTimeout, onClientLogoutRef]);

  const resetTimeout = useCallback(() => {
    lastActivityRef.current = Date.now();
    clearIdleTimeout();

    timeoutRef.current = window.setTimeout(() => {
      void runLogout();
    }, timeoutMs);
  }, [clearIdleTimeout, runLogout, timeoutMs]);

  const sendHeartbeat = useCallback(async () => {
    await sendAutoLogoutHeartbeat({
      heartbeatAbortControllerRef,
      lastHeartbeatSyncAtRef,
      mountedRef,
      logoutStartedRef,
    });
  }, []);

  const syncHeartbeatIfNeeded = useCallback((nowMs: number = Date.now()) => {
    if (logoutStartedRef.current || heartbeatAbortControllerRef.current) {
      return;
    }

    if (!shouldSyncActivityHeartbeat(lastHeartbeatSyncAtRef.current, nowMs, heartbeatSyncWindowMs)) {
      return;
    }

    void sendHeartbeat();
  }, [heartbeatSyncWindowMs, sendHeartbeat]);
  const resetTimeoutRef = useLatestRef(resetTimeout);
  const sendHeartbeatRef = useLatestRef(sendHeartbeat);
  const syncHeartbeatIfNeededRef = useLatestRef(syncHeartbeatIfNeeded);

  useEffect(() => {
    mountedRef.current = true;
    reconnectEnabledRef.current = true;
    logoutStartedRef.current = false;
    reconnectAttemptRef.current = 0;
    lastHeartbeatSyncAtRef.current = 0;

    return () => {
      mountedRef.current = false;
      reconnectEnabledRef.current = false;
      reconnectAttemptRef.current = 0;
      clearIdleTimeout();
      clearHeartbeat();
      clearHeartbeatRequest();
      cleanupSocket();
    };
  }, [cleanupSocket, clearHeartbeat, clearHeartbeatRequest, clearIdleTimeout]);

  useEffect(() => {
    return bindAutoLogoutActivityListeners({
      heartbeatMs,
      heartbeatRef,
      activityListenersAttachedRef,
      lastResetByEventRef,
      resetTimeout: () => resetTimeoutRef.current(),
      sendHeartbeat: () => sendHeartbeatRef.current(),
      syncHeartbeatIfNeeded: (nowMs) => syncHeartbeatIfNeededRef.current(nowMs),
      clearIdleTimeout,
      clearHeartbeat,
      clearHeartbeatRequest,
    });
  }, [
    clearHeartbeat,
    clearHeartbeatRequest,
    clearIdleTimeout,
    heartbeatMs,
    resetTimeoutRef,
    sendHeartbeatRef,
    syncHeartbeatIfNeededRef,
  ]);

  useEffect(() => {
    return bindAutoLogoutVisibilityChange({
      timeoutMs,
      lastActivityRef,
      runLogout,
      resetTimeout,
      syncHeartbeatIfNeeded,
    });
  }, [resetTimeout, runLogout, syncHeartbeatIfNeeded, timeoutMs]);

  useEffect(() => {
    const unsubscribeForcedLogout = subscribeForcedLogout((payload) => {
      const message = String(payload.message || "").trim();
      if (message) {
        persistAuthNotice(message);
      }
      void runClientLogout();
    });

    return () => {
      unsubscribeForcedLogout();
    };
  }, [runClientLogout]);

  useEffect(() => {
    return bindAutoLogoutSocket({
      username,
      mountedRef,
      reconnectEnabledRef,
      reconnectAttemptRef,
      wsRef,
      reconnectRef,
      clearReconnect,
      cleanupSocket,
      runClientLogout,
    });
  }, [cleanupSocket, clearReconnect, runClientLogout, username]);

  return null;
}
