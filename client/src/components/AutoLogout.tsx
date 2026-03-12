import { useCallback, useEffect, useRef } from "react";
import { activityHeartbeat } from "@/lib/api";

interface AutoLogoutProps {
  onLogout: () => void | Promise<void>;
  timeoutMinutes?: number;
  heartbeatIntervalMinutes?: number;
  username?: string;
}

export default function AutoLogout({
  onLogout,
  timeoutMinutes = 30,
  heartbeatIntervalMinutes = 5,
  username,
}: AutoLogoutProps) {
  const timeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const lastResetByEventRef = useRef<number>(0);
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
    clearIdleTimeout();
    clearHeartbeat();
    cleanupSocket();
    await onLogout();
  }, [cleanupSocket, clearHeartbeat, clearIdleTimeout, onLogout]);

  const resetTimeout = useCallback(() => {
    lastActivityRef.current = Date.now();
    clearIdleTimeout();

    timeoutRef.current = window.setTimeout(() => {
      console.log("Auto-logout due to inactivity");
      void runLogout();
    }, timeoutMs);
  }, [clearIdleTimeout, runLogout, timeoutMs]);

  const sendHeartbeat = useCallback(async () => {
    const activityId = localStorage.getItem("activityId");
    const fingerprint = localStorage.getItem("fingerprint");

    if (!activityId) return;

    try {
      await activityHeartbeat({
        activityId,
        pcName: navigator.platform || "Unknown",
        browser: navigator.userAgent,
        fingerprint: fingerprint || undefined,
      });
    } catch (error) {
      console.warn("Heartbeat failed:", error);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    reconnectEnabledRef.current = true;
    logoutStartedRef.current = false;

    return () => {
      mountedRef.current = false;
      reconnectEnabledRef.current = false;
      clearIdleTimeout();
      clearHeartbeat();
      cleanupSocket();
    };
  }, [cleanupSocket, clearHeartbeat, clearIdleTimeout]);

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
    };
  }, [clearHeartbeat, clearIdleTimeout, heartbeatMs, resetTimeout, sendHeartbeat]);

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
      if (event.key === "forceLogout" && event.newValue === "true") {
        localStorage.removeItem("forceLogout");
        void runLogout();
      }

      if (event.key === "token" && !event.newValue) {
        void runLogout();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [runLogout]);

  useEffect(() => {
    const currentUsername = username || localStorage.getItem("username");
    const token = localStorage.getItem("token");
    if (!currentUsername || !token) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    reconnectEnabledRef.current = true;

    const scheduleReconnect = () => {
      if (!mountedRef.current || !reconnectEnabledRef.current || !localStorage.getItem("token")) {
        return;
      }

      clearReconnect();
      reconnectRef.current = window.setTimeout(() => {
        reconnectRef.current = null;
        connectWebSocket();
      }, 5000);
    };

    const connectWebSocket = () => {
      if (!mountedRef.current || !reconnectEnabledRef.current) return;

      const currentToken = localStorage.getItem("token");
      if (!currentToken) return;

      try {
        const wsUrl = `${protocol}//${host}/ws?token=${encodeURIComponent(currentToken)}`;
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            if (message.type === "kicked") {
              alert(message.reason || "Anda telah dilogout oleh pentadbir.");
              void runLogout();
            }

            if (message.type === "banned") {
              localStorage.setItem("banned", "1");
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
      cleanupSocket();
    };
  }, [cleanupSocket, clearReconnect, runLogout, username]);

  return null;
}
