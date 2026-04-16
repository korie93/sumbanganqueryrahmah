import { useEffect, useRef, useState } from "react";
import { subscribeToastState } from "@/hooks/use-toast";
import {
  buildToastAnnouncement,
  resolveToastAnnouncementPriority,
} from "@/components/toast-live-region-utils";

export function ToastLiveRegion() {
  const [politeAnnouncement, setPoliteAnnouncement] = useState("");
  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState("");
  const lastAnnouncedToastIdRef = useRef<string | null>(null);

  useEffect(() => {
    return subscribeToastState((state) => {
      const nextToast = state.toasts[0];
      if (!nextToast?.open || nextToast.id === lastAnnouncedToastIdRef.current) {
        return;
      }

      const announcement = buildToastAnnouncement(nextToast);
      if (!announcement) {
        return;
      }

      lastAnnouncedToastIdRef.current = nextToast.id;

      if (resolveToastAnnouncementPriority(nextToast) === "assertive") {
        setPoliteAnnouncement("");
        setAssertiveAnnouncement(announcement);
        return;
      }

      setAssertiveAnnouncement("");
      setPoliteAnnouncement(announcement);
    });
  }, []);

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {politeAnnouncement}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {assertiveAnnouncement}
      </div>
    </>
  );
}
