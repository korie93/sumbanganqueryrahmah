import crypto from "crypto";
import { parseCollectionAmountMyrInput } from "../../../shared/collection-amount-types";
import { normalizeCollectionText } from "../../routes/collection.validation";

export type CollectionRecordAuditSource = "relation" | "legacy" | "none";

export type CollectionRecordAuditSnapshot = {
  customerName: string;
  paymentDate: string;
  amount: number;
  collectionStaffNickname: string;
  activeReceiptCount: number;
  activeReceiptSource: CollectionRecordAuditSource;
};

export function maskCollectionAuditCustomerName(value: unknown): string {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  const digest = crypto.createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 12);
  return `${normalized.slice(0, 1)}***#${digest}`;
}

function toCollectionAuditAmount(value: unknown) {
  const strictParsed = parseCollectionAmountMyrInput(value, { allowZero: true });
  if (strictParsed !== null) {
    return strictParsed;
  }

  const parsed = Number(String(value ?? "").trim().replace(/,/g, "") || 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

export function resolveCollectionAuditReceiptState(params: {
  relationCount: number;
  legacyReceiptFile?: string | null;
}): {
  count: number;
  source: CollectionRecordAuditSource;
} {
  const relationCount = Math.max(0, Number(params.relationCount) || 0);
  if (relationCount > 0) {
    return {
      count: relationCount,
      source: "relation",
    };
  }

  if (normalizeCollectionText(params.legacyReceiptFile)) {
    return {
      count: 1,
      source: "legacy",
    };
  }

  return {
    count: 0,
    source: "none",
  };
}

export function buildCollectionAuditSnapshot(params: {
  customerName: unknown;
  paymentDate: unknown;
  amount: unknown;
  collectionStaffNickname: unknown;
  activeReceiptCount: number;
  activeReceiptSource: CollectionRecordAuditSource;
}): CollectionRecordAuditSnapshot {
  return {
    customerName: maskCollectionAuditCustomerName(params.customerName),
    paymentDate: String(params.paymentDate || "").trim(),
    amount: toCollectionAuditAmount(params.amount),
    collectionStaffNickname: String(params.collectionStaffNickname || "").trim(),
    activeReceiptCount: Math.max(0, Number(params.activeReceiptCount) || 0),
    activeReceiptSource: params.activeReceiptSource,
  };
}

export function buildCollectionAuditFieldChanges(
  before: CollectionRecordAuditSnapshot,
  after: CollectionRecordAuditSnapshot,
) {
  const changes: Record<string, { from: string | number; to: string | number }> = {};

  if (before.customerName !== after.customerName) {
    changes.customerName = {
      from: before.customerName,
      to: after.customerName,
    };
  }
  if (before.paymentDate !== after.paymentDate) {
    changes.paymentDate = {
      from: before.paymentDate,
      to: after.paymentDate,
    };
  }
  if (before.amount !== after.amount) {
    changes.amount = {
      from: before.amount,
      to: after.amount,
    };
  }
  if (before.collectionStaffNickname !== after.collectionStaffNickname) {
    changes.collectionStaffNickname = {
      from: before.collectionStaffNickname,
      to: after.collectionStaffNickname,
    };
  }

  return changes;
}
