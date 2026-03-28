import { useCallback, useEffect, useRef } from "react";
import { activityHeartbeat } from "@/lib/api";
import { resolveAutoLogoutReconnectDelayMs } from "@/components/auto-logout-websocket";
import {
  getStoredActivityId,
  getStoredFingerprint,
  getStoredUsername,
  parseForcedLogoutStorageValue,
  persistAuthNotice,
  setBannedSessionFlag,
} from "@/lib/auth-session";

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

  const timeoutMs = timeoutMinutes * 60 * 1000;
  const heartbeatMs = heartbeatIntervalMinutes * 60 * 1000;

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

    if (wsRef.current) {
      const socket = wsRef.current;
      wsRef.current = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
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
    await onLogout();
  }, [cleanupSocket, clearHeartbeat, clearHeartbeatRequest, clearIdleTimeout, onLogout]);

  const runClientLogout = useCallback(async () => {
    if (logoutStartedRef.current) return;
    logoutStartedRef.current = true;
    reconnectEnabledRef.current = false;
    reconnectAttemptRef.current = 0;
    clearIdleTimeout();
    clearHeartbeat();
    clearHeartbeatRequest();
    cleanupSocket();
    await onClientLogout();
  }, [cleanupSocket, clearHeartbeat, clearHeartbeatRequest, clearIdleTimeout, onClientLogout]);

  const resetTimeout = useCallback(() => {
    lastActivityRef.current = Date.now();
    clearIdleTimeout();

    timeoutRef.current = window.setTimeout(() => {
      console.log("Auto-logout due to inactivity");
      void runLogout();
    }, timeoutMs);
  }, [clearIdleTimeout, runLogout, timeoutMs]);

  const sendHeartbeat = useCallback(async () => {
    if (logoutStartedRef.current) return;
    if (heartbeatAbortControllerRef.current) return;

    const activityId = getStoredActivityId();
    const fingerprint = getStoredFingerprint();

    if (!activityId) return;

    const controller = new AbortController();
    heartbeatAbortControllerRef.current = controller;

    try {
      await activityHeartbeat({
        activityId,
        pcName: navigator.platform || "Unknown",
        browser: navigator.userAgent,
        fingerprint: fingerprint || undefined,
      }, {
        signal: controller.signal,
      });
    } catch (error) {
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        logoutStartedRef.current
      ) {
        return;
      }
      console.warn("Heartbeat failed:", error);
    } finally {
      if (heartbeatAbortControllerRef.current === controller) {
        heartbeatAbortControllerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    reconnectEnabledRef.current = true;
    logoutStartedRef.current = false;
    reconnectAttemptRef.current = 0;

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
    const events = ["mousedown", "keydown", "touchstart", "click"];

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastResetByEventRef.current < 1000) return;
      lastResetByEventRef.current = now;
      resetTimeout();
    };

    events.forEach((eventName) => {
      document.addEventListener(eventName, handleActivity, { passive: true });
    });

    resetTimeout();
    heartbeatRef.current = window.setInterval(sendHeartbeat, heartbeatMs);

    return () => {
      events.forEach((eventName) => {
        document.removeEventListener(eventName, handleActivity);
      });
      clearIdleTimeout();
      clearHeartbeat();
      clearHeartbeatRequest();
    };
  }, [clearHeartbeat, clearHeartbeatRequest, clearIdleTimeout, heartbeatMs, resetTimeout, sendHeartbeat]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      const idleTime = Date.now() - lastActivityRef.current;
      if (idleTime >= timeoutMs) {
        void runLogout();
        return;
      }

      resetTimeout();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [resetTimeout, runLogout, timeoutMs]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "forceLogout") {
        const payload = parseForcedLogoutStorageValue(event.newValue);
        if (!payload) {
          return;
        }
        localStorage.removeItem("forceLogout");
        if (payload.message) {
          persistAuthNotice(payload.message);
        }
        void runClientLogout();
      }

      if (event.key === "user" && !event.newValue) {
        void runClientLogout();
      }
    };

    const handleForceLogout = (event: Event) => {
      const message = String((event as CustomEvent<{ message?: string }>).detail?.message || "").trim();
      if (message) {
        persistAuthNotice(message);
      }
      localStorage.removeItem("forceLogout");
      void runClientLogout();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("force-logout", handleForceLogout);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("force-logout", handleForceLogout);
    };
  }, [runClientLogout]);

  useEffect(() => {
    const currentUsername = username || getStoredUsername();
    if (!currentUsername) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    reconnectEnabledRef.current = true;
    reconnectAttemptRef.current = 0;

    const scheduleReconnect = () => {
      const nextUsername = username || getStoredUsername();
      if (!mountedRef.current || !reconnectEnabledRef.current || !nextUsername) {
        return;
      }

      clearReconnect();
      const attempt = reconnectAttemptRef.current;
      const delayMs = resolveAutoLogoutReconnectDelayMs(attempt);
      reconnectRef.current = window.setTimeout(() => {
        reconnectRef.current = null;
        reconnectAttemptRef.current = attempt + 1;
        connectWebSocket();
      }, delayMs);
    };

    const connectWebSocket = () => {
      if (!mountedRef.current || !reconnectEnabledRef.current) return;
      if (
        wsRef.current
        && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      try {
        const wsUrl = `${protocol}//${host}/ws`;
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (wsRef.current === socket) {
            reconnectAttemptRef.current = 0;
          }
        };

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            if (message.type === "kicked") {
              alert(message.reason || "Anda telah dilogout oleh pentadbir.");
              void runClientLogout();
            }

            if (message.type === "logout") {
              if (message.reason) {
                alert(String(message.reason));
              }
              void runClientLogout();
            }

            if (message.type === "banned") {
              setBannedSessionFlag(true);
              alert(message.reason || "Akaun anda telah disekat.");
              window.location.href = "/";
            }

            if (message.type === "maintenance_update") {
              const payload = {
                maintenance: !!message.maintenance,
                message: String(message.message || ""),
                type: message.mode === "hard" ? "hard" : "soft",
                startTime: message.startTime || null,
                endTime: message.endTime || null,
              };
              localStorage.setItem("maintenanceState", JSON.stringify(payload));
              window.dispatchEvent(new CustomEvent("maintenance-updated", { detail: payload }));
              if (payload.maintenance) {
                window.location.href = "/maintenance";
              }
            }

            if (message.type === "settings_updated") {
              window.dispatchEvent(new CustomEvent("settings-updated", { detail: message }));
            }
          } catch (error) {
            console.warn("Failed to parse WebSocket message:", error);
          }
        };

        socket.onclose = () => {
          if (wsRef.current === socket) {
            wsRef.current = null;
          }
          scheduleReconnect();
        };

        socket.onerror = (error) => {
          console.warn("WebSocket error:", error);
        };
      } catch (error) {
        console.warn("Failed to connect WebSocket:", error);
        scheduleReconnect();
      }
    };

    connectWebSocket();

    return () => {
      reconnectEnabledRef.current = false;
      reconnectAttemptRef.current = 0;
      cleanupSocket();
    };
  }, [cleanupSocket, clearReconnect, runClientLogout, username]);

  return null;
}
