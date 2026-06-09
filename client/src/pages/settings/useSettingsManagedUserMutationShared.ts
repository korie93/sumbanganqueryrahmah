import type { ActivationDeliveryPayload } from "@/lib/api";
import type { ToastFunction } from "@/hooks/use-toast";
import { formatOperationalDateTime } from "@/lib/date-format";

export type ToastFn = ToastFunction;

export type ManagedAccountStatus = "pending_activation" | "active" | "suspended" | "disabled";

export type ManagedSecretDialogParams = {
  title: string;
  description: string;
  value?: string | undefined;
};

export function formatActivationExpiry(value: string | null | undefined) {
  if (!value) return "the configured expiry window";
  return formatOperationalDateTime(value, { fallback: value });
}

export function isDevOutboxActivation(
  activation: ActivationDeliveryPayload | undefined,
): activation is ActivationDeliveryPayload & { deliveryMode: "dev_outbox" } {
  return activation?.deliveryMode === "dev_outbox"
    && Boolean(String(activation.previewUrl || "").trim());
}
