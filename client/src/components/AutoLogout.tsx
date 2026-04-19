import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import {
  resolveActivityHeartbeatSyncWindowMs,
  shouldSyncActivityHeartbeat,
} from "@/components/auto-logout-heartbeat-utils";
import {
  persistAuthNotice,
  subscribeForcedLogout,
} from "@/lib/auth-session";
import { logClientError } from "@/lib/client-logger";
import { sendAutoLogoutHeartbeat } from "@/components/auto-logout-heartbeat-runtime";
import {
  bindAutoLogoutActivityListeners,
  bindAutoLogoutVisibilityChange,
} from "@/components/auto-logout-activity-runtime";
import {
  bindAutoLogoutSocket,
  disposeAutoLogoutSocket,
} from "@/components/auto-logout-socket-runtime";
import {
  AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE,
  buildAutoLogoutReconnectFeedbackTitle,
  buildAutoLogoutReconnectFeedbackMessage,
} from "@/components/auto-logout-reconnect-feedback";
import { cleanupAutoLogoutRuntimeResources } from "@/components/auto-logout-runtime-cleanup";

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
  const [reconnectFeedback, setReconnectFeedback] = useState(
    AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE,
  );
  const timeoutRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const heartbeatAbortControllerRef = useRef<AbortController | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const lastResetByEventRef = useRef<number>(0);
  const reconnectAttemptRef = useRef(0);
  const socketGenerationRef = useRef(0);
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
  const reconnectFeedbackTitle = buildAutoLogoutReconnectFeedbackTitle(reconnectFeedback);
  const reconnectFeedbackMessage = buildAutoLogoutReconnectFeedbackMessage(reconnectFeedback);

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

  const resetReconnectFeedback = useCallback(() => {
    if (mountedRef.current) {
      setReconnectFeedback(AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE);
    }
  }, []);

  const cleanupSocket = useCallback(() => {
    const activeSocket = wsRef.current;
    disposeAutoLogoutSocket(activeSocket, wsRef);
  }, []);

  const stopRuntimeResources = useCallback(() => {
    cleanupAutoLogoutRuntimeResources({
      clearHeartbeat,
      clearHeartbeatRequest,
      clearIdleTimeout,
      clearReconnect,
      cleanupSocket,
      reconnectAttemptRef,
      reconnectEnabledRef,
    });
  }, [
    cleanupSocket,
    clearHeartbeat,
    clearHeartbeatRequest,
    clearIdleTimeout,
    clearReconnect,
  ]);

  const prepareLogoutTransition = useCallback(() => {
    if (logoutStartedRef.current) {
      return false;
    }

    logoutStartedRef.current = true;
    resetReconnectFeedback();
    stopRuntimeResources();
    return true;
  }, [resetReconnectFeedback, stopRuntimeResources]);

  const runLogout = useCallback(async () => {
    if (!prepareLogoutTransition()) return;
    try {
      await onLogoutRef.current();
    } catch (error: unknown) {
      logClientError("Auto logout callback failed", error, {
        source: "client.log",
        component: "AutoLogout",
      });
    }
  }, [onLogoutRef, prepareLogoutTransition]);

  const runClientLogout = useCallback(async () => {
    if (!prepareLogoutTransition()) return;
    try {
      await onClientLogoutRef.current();
    } catch (error: unknown) {
      logClientError("Auto client logout callback failed", error, {
        source: "client.log",
        component: "AutoLogout",
      });
    }
  }, [onClientLogoutRef, prepareLogoutTransition]);

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
      stopRuntimeResources();
    };
  }, [stopRuntimeResources]);

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
    resetReconnectFeedback();
    return bindAutoLogoutSocket({
      username,
      mountedRef,
      reconnectEnabledRef,
      reconnectAttemptRef,
      socketGenerationRef,
      wsRef,
      reconnectRef,
      clearReconnect,
      cleanupSocket,
      runClientLogout,
      onReconnectStateChange: setReconnectFeedback,
    });
  }, [cleanupSocket, clearReconnect, resetReconnectFeedback, runClientLogout, username]);

  return reconnectFeedback.visible ? (
    <div className="pointer-events-none fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top,0px))] z-[var(--z-toast)] -translate-x-1/2 px-4">
      <div
        role="status"
        aria-live="polite"
        aria-label={`${reconnectFeedbackTitle}. ${reconnectFeedbackMessage}`}
        className="flex w-[calc(100vw-2rem)] max-w-sm items-start gap-3 rounded-2xl border border-amber-400/30 bg-background/95 px-4 py-3 text-sm shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85"
      >
        <span
          aria-hidden="true"
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
            reconnectFeedback.mode === "terminal"
              ? "bg-destructive"
              : "bg-amber-400 animate-pulse"
          }`}
        />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-foreground">{reconnectFeedbackTitle}</p>
          <p className="text-xs leading-5 text-muted-foreground">{reconnectFeedbackMessage}</p>
        </div>
      </div>
    </div>
  ) : null;
}
