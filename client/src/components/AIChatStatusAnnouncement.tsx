import type { AIChatStatus } from "@/lib/ai-chat";

type AIChatAnnouncementState = {
  enabled: boolean;
  status: AIChatStatus;
  gateNotice: string | null;
  slowNotice: boolean;
  retryAvailable: boolean;
};

/** One short status at a time; answer reveal text deliberately is not an input. */
export function getAIChatStatusAnnouncement({ enabled, status, gateNotice, slowNotice, retryAvailable }: AIChatAnnouncementState) {
  if (!enabled) return ""; // The disabled notice is already an alert.
  if (gateNotice) return gateNotice;
  if (retryAvailable) return "Permintaan AI gagal. Cuba semula soalan terakhir tersedia.";
  if (slowNotice && (status === "SEARCHING" || status === "PROCESSING")) {
    return "Jawapan mengambil masa lebih lama daripada biasa. Sistem masih memproses data.";
  }
  if (status === "SEARCHING") return "AI sedang mencari maklumat...";
  if (status === "PROCESSING") return "AI sedang memproses data...";
  if (status === "TYPING") return "AI sedang menaip jawapan...";
  return "";
}

export function AIChatStatusAnnouncement(state: AIChatAnnouncementState) {
  return (
    <span className="sr-only" role="status" aria-label="Status AI SQR" aria-live="polite" aria-atomic="true" data-ai-status-announcement="true">
      {getAIChatStatusAnnouncement(state)}
    </span>
  );
}
