import type { ActivityRecord } from "@/pages/activity/types";

const DEVICE_TYPE_LABELS: Record<string, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
  tablet: "Tablet",
  unknown: "Unknown device",
};

export function getActivityDeviceTypeLabel(
  deviceType: ActivityRecord["deviceType"] | null,
): string {
  const normalized = String(deviceType || "").trim().toLowerCase();
  return DEVICE_TYPE_LABELS[normalized] || "Unknown device";
}

export function getActivityDeviceLabel(
  activity: Pick<ActivityRecord, "deviceType" | "platform">,
): string {
  const device = getActivityDeviceTypeLabel(activity.deviceType ?? null);
  const platform = String(activity.platform || "").trim();
  return platform && platform !== "Unknown" ? `${device} · ${platform}` : device;
}
