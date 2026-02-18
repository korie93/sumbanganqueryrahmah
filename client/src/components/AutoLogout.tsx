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
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];

    const handleActivity = () => {
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
      console.log("AutoLogout: No username or token, skipping WebSocket connection");
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    
    console.log(`AutoLogout: Preparing WebSocket connection for ${currentUsername}`);
    console.log(`AutoLogout: Host = ${host}, Protocol = ${protocol}`);

    const connectWebSocket = () => {
      try {
        const currentToken = localStorage.getItem("token");
        if (!currentToken) {
          console.log("AutoLogout: Token removed, not reconnecting");
          return;
        }
        
        const wsUrl = `${protocol}//${host}/ws?token=${encodeURIComponent(currentToken)}`;
        console.log(`AutoLogout: Connecting to WebSocket at ${wsUrl.substring(0, 50)}...`);
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("WebSocket connected for real-time notifications");
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === "kicked") {
              console.log("User kicked by admin:", message.reason);
              alert(message.reason || "Anda telah dilogout oleh pentadbir.");
              handleLogout();
            }
            
            if (message.type === "banned") {
              console.log("User banned:", message.reason);
              localStorage.setItem("banned", "1");
              alert(message.reason || "Akaun anda telah disekat.");
              window.location.href = "/";
            }
          } catch (err) {
            console.warn("Failed to parse WebSocket message:", err);
          }
        };

        ws.onclose = (event) => {
          console.log(`WebSocket disconnected: code=${event.code}, reason=${event.reason}`);
          setTimeout(() => {
            if (localStorage.getItem("token")) {
              console.log("AutoLogout: Attempting WebSocket reconnection...");
              connectWebSocket();
            }
          }, 5000);
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          console.error("WebSocket readyState:", ws.readyState);
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
