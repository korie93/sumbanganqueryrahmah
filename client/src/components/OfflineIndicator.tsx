import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import {
  readNavigatorOnlineState,
  resolveOfflineIndicatorMessage,
} from "@/components/offline-indicator-utils";

function getOnlineState() {
  if (typeof navigator === "undefined") {
    return true;
  }

  return readNavigatorOnlineState(navigator);
}

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(getOnlineState);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[var(--z-toast)] flex justify-center px-4"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex max-w-xl items-center gap-2 rounded-full border border-amber-500/40 bg-background/95 px-4 py-2 text-sm text-foreground shadow-lg backdrop-blur">
        <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden="true" />
        <span>{resolveOfflineIndicatorMessage()}</span>
      </div>
    </div>
  );
}
