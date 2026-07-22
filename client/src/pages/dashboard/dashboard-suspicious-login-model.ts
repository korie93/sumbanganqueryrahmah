import type { RecentLoginActivity } from "@/pages/dashboard/types";

export type SuspiciousLoginTone = "danger" | "info" | "warning";

export interface DashboardSuspiciousLoginItem {
  activity: RecentLoginActivity;
  deviceLabel: string;
  eventTime: string | null;
  eventTimeLabel: string;
  networkLabel: string;
  reasonLabel: string;
  severityLabel: string;
  tone: SuspiciousLoginTone;
}

export interface DashboardSuspiciousLoginReviewStep {
  description: string;
  id: "identity" | "network" | "response";
  title: string;
}

export function buildDashboardSuspiciousLoginReviewSteps(
  item: DashboardSuspiciousLoginItem,
): DashboardSuspiciousLoginReviewStep[] {
  const eventReview =
    item.activity.status === "failed"
      ? "Bandingkan masa kejadian dengan percubaan login pengguna yang sah."
      : "Sahkan sama ada penamatan sesi ini dijangka oleh pengguna atau operator.";

  return [
    {
      id: "identity",
      title: "Sahkan identiti dan masa",
      description: eventReview,
    },
    {
      id: "network",
      title: "Bandingkan rangkaian dan peranti",
      description:
        "Semak sama ada IP, browser dan platform sepadan dengan sesi pengguna yang biasa.",
    },
    {
      id: "response",
      title: "Tentukan tindakan keselamatan",
      description:
        "Jika tidak dikenali, buka Activity Audit untuk menamatkan sesi atau menyekat akaun melalui kawalan berizin.",
    },
  ];
}
