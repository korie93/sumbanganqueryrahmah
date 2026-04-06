import type { ManagedUser } from "@/pages/settings/types";

export function normalizeManagedUserLifecycleTargetId(value: string | null | undefined) {
  return String(value || "").trim();
}

export function getManagedUserDeliveryPreviewUrl(value: string | null | undefined) {
  return String(value || "").trim();
}

export function resolveManagedUserDeliveryRecipient(
  user: Pick<ManagedUser, "email" | "username">,
  recipientEmail: string | null | undefined,
) {
  return String(recipientEmail || user.email || user.username);
}

export function shouldOpenManagedUserSmtpPreview(options: {
  deliveryMode: string | null | undefined;
  previewUrl: string | null | undefined;
  sent: boolean | null | undefined;
}) {
  return Boolean(options.sent)
    && options.deliveryMode === "smtp"
    && Boolean(getManagedUserDeliveryPreviewUrl(options.previewUrl));
}
