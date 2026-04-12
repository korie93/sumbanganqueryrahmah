import type { CollectionAmountMyrNumber } from "../../shared/collection-amount-types";
import { parseCollectionAmountMyrNumber } from "../../shared/collection-amount-types";
import type { CollectionDailyPaidCustomer, CollectionDailyUser } from "../storage-postgres";
import { resolveCollectionPiiFieldValue } from "../lib/collection-pii-encryption";
import type {
  CollectionDailyPaidCustomerRow,
  CollectionDailyQueryResult,
  CollectionDailyUserRow,
} from "./collection-daily-repository-types";

export function readCollectionDailyRows<TRow>(result: CollectionDailyQueryResult): TRow[] {
  return Array.isArray(result.rows) ? (result.rows as TRow[]) : [];
}

export function mapCollectionDailyUserRow(row: CollectionDailyUserRow): CollectionDailyUser {
  return {
    id: String(row.id ?? ""),
    username: String(row.username ?? "").toLowerCase(),
    role: String(row.role ?? "user"),
  };
}

export function mapCollectionDailyPaidCustomerRow(
  row: CollectionDailyPaidCustomerRow,
): CollectionDailyPaidCustomer {
  return {
    id: String(row.id ?? ""),
    customerName: resolveCollectionPiiFieldValue({
      field: "customerName",
      plaintext: row.customer_name,
      encrypted: row.customer_name_encrypted,
    }),
    accountNumber: resolveCollectionPiiFieldValue({
      field: "accountNumber",
      plaintext: row.account_number,
      encrypted: row.account_number_encrypted,
    }),
    amount: parseCollectionAmountMyrNumber(row.amount ?? 0) as CollectionAmountMyrNumber,
    collectionStaffNickname: String(row.collection_staff_nickname ?? ""),
  };
}
