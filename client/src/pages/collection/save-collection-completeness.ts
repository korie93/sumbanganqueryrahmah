import type {
  SaveCollectionFieldName,
  SaveCollectionReadiness,
} from "./save-collection-page-utils";

// Presentation groups only. Validation and save eligibility remain authoritative
// in getSaveCollectionReadiness; account/card are one either-or requirement.
const groups: ReadonlyArray<{
  label: string;
  fields: readonly SaveCollectionFieldName[];
}> = [
  { label: "Customer Name", fields: ["customerName"] },
  { label: "IC Number", fields: ["icNumber"] },
  { label: "Phone Number", fields: ["customerPhone"] },
  { label: "Account / Card Number", fields: ["accountNumber", "cardNumber"] },
  { label: "Batch", fields: ["batch"] },
  { label: "Payment Date", fields: ["paymentDate"] },
  { label: "Amount (RM)", fields: ["amount"] },
];

export function getSaveCollectionCompleteness(readiness: SaveCollectionReadiness) {
  const items = groups.map((group) => ({
    label: group.label,
    complete: group.fields.every((field) => !readiness.errors[field]),
  }));
  const completed = items.filter((item) => item.complete).length;
  return {
    items,
    completed,
    total: items.length,
    remaining: items.length - completed,
    nicknameError: readiness.errors.staffNickname,
  };
}
