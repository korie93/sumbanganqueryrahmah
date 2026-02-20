import { useEffect, useRef, useCallback } from "react";
import { activityHeartbeat, activityLogout } from "@/lib/api";

interface AutoLogoutProps {
  onLogout: () => void;
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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const lastResetByEventRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  const timeoutMs = timeoutMinutes * 60 * 1000;
  const heartbeatMs = heartbeatIntervalMinutes * 60 * 1000;

  const handleLogout = useCallback(async () => {
    const activityId = localStorage.getItem("activityId");
    if (activityId) {
      try {
        await activityLogout(activityId);
      } catch (err) {
        console.warn("Failed to log activity logout:", err);
      }
    }
    onLogout();
  }, [onLogout]);

  const resetTimeout = useCallback(() => {
    lastActivityRef.current = Date.now();

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      console.log("Auto-logout due to inactivity");
      handleLogout();
    }, timeoutMs);
  }, [timeoutMs, handleLogout]);

  const sendHeartbeat = useCallback(async () => {
    const activityId = localStorage.getItem("activityId");
    const fingerprint = localStorage.getItem("fingerprint");

    if (activityId) {
      try {
        await activityHeartbeat({
          activityId: activityId,
          pcName: navigator.platform || "Unknown",
          browser: navigator.userAgent,
          fingerprint: fingerprint || undefined,
        });
      } catch (err) {
        console.warn("Heartbeat failed:", err);
      }
    }
  }, []);

  useEffect(() => {
    const events = ["mousedown", "keydown", "touchstart", "click"];

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastResetByEventRef.current < 1000) return;
      lastResetByEventRef.current = now;
      resetTimeout();
    };

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    resetTimeout();

    heartbeatRef.current = setInterval(sendHeartbeat, heartbeatMs);

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [resetTimeout, sendHeartbeat, heartbeatMs]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const idleTime = Date.now() - lastActivityRef.current;
        if (idleTime >= timeoutMs) {
          handleLogout();
        } else {
          resetTimeout();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [timeoutMs, resetTimeout, handleLogout]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "forceLogout" && event.newValue === "true") {
        localStorage.removeItem("forceLogout");
        handleLogout();
      }

      if (event.key === "token" && !event.newValue) {
        handleLogout();
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [handleLogout]);

  useEffect(() => {
    const currentUsername = username || localStorage.getItem("username");
    const token = localStorage.getItem("token");
    if (!currentUsername || !token) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;

    const connectWebSocket = () => {
      try {
        const currentToken = localStorage.getItem("token");
        if (!currentToken) {
          return;
        }
        
        const wsUrl = `${protocol}//${host}/ws?token=${encodeURIComponent(currentToken)}`;
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {};

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === "kicked") {
              alert(message.reason || "Anda telah dilogout oleh pentadbir.");
              handleLogout();
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
          } catch (err) {
            console.warn("Failed to parse WebSocket message:", err);
          }
        };

        ws.onclose = (event) => {
          setTimeout(() => {
            if (localStorage.getItem("token")) {
              connectWebSocket();
            }
          }, 5000);
        };

        ws.onerror = (error) => {
          console.warn("WebSocket error:", error);
        };
      } catch (err) {
        console.warn("Failed to connect WebSocket:", err);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [username, handleLogout]);

  return null;
}
