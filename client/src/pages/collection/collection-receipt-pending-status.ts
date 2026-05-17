export type CollectionReceiptPendingStatus = "pending" | "saving" | "failed";

export type CollectionReceiptPendingStatusCopy = {
  badgeLabel: string;
  helperText: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
};

export function resolveCollectionReceiptPendingStatusCopy(
  status: CollectionReceiptPendingStatus,
): CollectionReceiptPendingStatusCopy {
  if (status === "saving") {
    return {
      badgeLabel: "Scanning / Saving",
      helperText: "Receipt sedang diupload dan diimbas sebelum rekod disimpan.",
      badgeVariant: "secondary",
    };
  }

  if (status === "failed") {
    return {
      badgeLabel: "Needs Retry",
      helperText: "Receipt masih belum disimpan. Semak mesej ralat dan cuba Save Collection semula.",
      badgeVariant: "destructive",
    };
  }

  return {
    badgeLabel: "Pending Upload",
    helperText: "Changes apply only after save.",
    badgeVariant: "outline",
  };
}
