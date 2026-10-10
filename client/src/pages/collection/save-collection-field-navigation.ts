import type { SaveCollectionFieldName } from "@/pages/collection/save-collection-page-utils";

type EditableSaveCollectionField = Exclude<SaveCollectionFieldName, "staffNickname">;

export const SAVE_COLLECTION_FIELD_TARGETS = {
  customerName: { id: "save-collection-customer-name", label: "Customer Name" },
  icNumber: { id: "save-collection-customer-ic-number", label: "IC Number" },
  customerPhone: { id: "save-collection-customer-phone", label: "Customer Phone Number" },
  accountNumber: { id: "save-collection-account-number", label: "Account Number" },
  cardNumber: { id: "save-collection-card-number", label: "Card Number" },
  batch: { id: "save-collection-batch", label: "Batch" },
  paymentDate: { id: "save-collection-payment-date-button", label: "Payment Date" },
  amount: { id: "save-collection-amount", label: "Amount (RM)" },
} as const satisfies Record<EditableSaveCollectionField, { id: string; label: string }>;

export function getSaveCollectionFieldTarget(field: SaveCollectionFieldName) {
  // Nickname selection belongs to the containing role-specific page, not this form.
  return field === "staffNickname" ? undefined : SAVE_COLLECTION_FIELD_TARGETS[field];
}

export function focusSaveCollectionField(
  field: SaveCollectionFieldName,
  targetDocument: Pick<Document, "getElementById"> | undefined = typeof document === "undefined"
    ? undefined
    : document,
): boolean {
  const target = getSaveCollectionFieldTarget(field);
  const element = target ? targetDocument?.getElementById(target.id) : null;
  if (!element || element.matches(":disabled, [aria-disabled='true']")) return false;

  // Focus only: in particular, do not activate the date picker or reveal a card.
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: "center", inline: "nearest" });
  return true;
}
