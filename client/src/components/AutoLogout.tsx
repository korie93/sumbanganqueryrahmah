import { useCallback, useEffect, useRef } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { useTimers } from "@/hooks/useTimers";
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
import { useAutoLogoutLifecycleController } from "@/components/auto-logout-lifecycle-state";
import { invokeAutoLogoutCallback } from "@/components/auto-logout-logout-utils";

interface AutoLogoutProps {
  onClientLogout: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  timeoutMinutes?: number;
  heartbeatIntervalMinutes?: number;
  username?: string;
}

/**
 * Renders the shared auto logout component used across SQR screens.
 */
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
  const wsRef = useRef<WebSocket | null>(null);
  const {
    activityListenersAttachedRef,
    lastHeartbeatSyncAtRef,
    logoutStartedRef,
    markLogoutStarted,
    markUnmountedLifecycle,
    mountedRef,
    reconnectAttemptRef,
    reconnectEnabledRef,
    startSessionLifecycle,
  } = useAutoLogoutLifecycleController();
  const onClientLogoutRef = useLatestRef(onClientLogout);
  const onLogoutRef = useLatestRef(onLogout);
  const {
    clearAllTimers,
    clearManagedInterval,
    clearManagedTimeout,
    setManagedInterval,
    setManagedTimeout,
  } = useTimers();

  const timeoutMs = timeoutMinutes * 60 * 1000;
  const heartbeatMs = heartbeatIntervalMinutes * 60 * 1000;
  const heartbeatSyncWindowMs = resolveActivityHeartbeatSyncWindowMs(heartbeatMs);

  const clearIdleTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearManagedTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [clearManagedTimeout]);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current !== null) {
      clearManagedInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, [clearManagedInterval]);

  const clearReconnect = useCallback(() => {
    if (reconnectRef.current !== null) {
      clearManagedTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
  }, [clearManagedTimeout]);

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
    markLogoutStarted();
    clearIdleTimeout();
    clearHeartbeat();
    clearHeartbeatRequest();
    cleanupSocket();
    await invokeAutoLogoutCallback(onLogoutRef.current, {
      label: "idle_logout",
    });
  }, [
    cleanupSocket,
    clearHeartbeat,
    clearHeartbeatRequest,
    clearIdleTimeout,
    logoutStartedRef,
    markLogoutStarted,
    onLogoutRef,
  ]);

  const runClientLogout = useCallback(async () => {
    if (logoutStartedRef.current) return;
    markLogoutStarted();
    clearIdleTimeout();
    clearHeartbeat();
    clearHeartbeatRequest();
    cleanupSocket();
    await invokeAutoLogoutCallback(onClientLogoutRef.current, {
      label: "client_logout",
    });
  }, [
    cleanupSocket,
    clearHeartbeat,
    clearHeartbeatRequest,
    clearIdleTimeout,
    logoutStartedRef,
    markLogoutStarted,
    onClientLogoutRef,
  ]);

  const resetTimeout = useCallback(() => {
    lastActivityRef.current = Date.now();
    clearIdleTimeout();

    timeoutRef.current = setManagedTimeout(() => {
      if (!mountedRef.current) return;
      void runLogout();
    }, timeoutMs);
  }, [clearIdleTimeout, runLogout, setManagedTimeout, timeoutMs]);

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
    startSessionLifecycle();

    return () => {
      markUnmountedLifecycle();
      clearIdleTimeout();
      clearHeartbeat();
      clearHeartbeatRequest();
      cleanupSocket();
      clearAllTimers();
    };
  }, [
    cleanupSocket,
    clearAllTimers,
    clearHeartbeat,
    clearHeartbeatRequest,
    clearIdleTimeout,
    markUnmountedLifecycle,
    startSessionLifecycle,
  ]);

  useEffect(() => {
    return bindAutoLogoutActivityListeners({
      heartbeatMs,
      heartbeatRef,
      activityListenersAttachedRef,
      lastResetByEventRef,
      resetTimeout: () => resetTimeoutRef.current(),
      sendHeartbeat: () => sendHeartbeatRef.current(),
      setHeartbeatInterval: setManagedInterval,
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
    setManagedInterval,
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
      if (!mountedRef.current) return;
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
      setReconnectTimeout: setManagedTimeout,
    });
  }, [cleanupSocket, clearReconnect, runClientLogout, setManagedTimeout, username]);

  return null;
}
