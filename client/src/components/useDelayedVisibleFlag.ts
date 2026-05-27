import { useEffect, useState } from "react";

export function useDelayedVisibleFlag(active: boolean, delayMs: number) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setVisible(true);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [active, delayMs]);

  return visible;
}
