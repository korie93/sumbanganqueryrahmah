import type { ActivationDeliveryPayload } from "@/lib/api";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";

export type ToastFn = (payload: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

export type ManagedAccountStatus = "pending_activation" | "active" | "suspended" | "disabled";

export type ManagedSecretDialogParams = {
  title: string;
  description: string;
  value?: string;
};

export function formatActivationExpiry(value: string | null | undefined) {
  if (!value) return "the configured expiry window";
  return formatDateTimeDDMMYYYY(value, { fallback: value });
}

export function isDevOutboxActivation(
  activation: ActivationDeliveryPayload | undefined,
): activation is ActivationDeliveryPayload & { deliveryMode: "dev_outbox" } {
  return activation?.deliveryMode === "dev_outbox"
    && Boolean(String(activation.previewUrl || "").trim());
}
