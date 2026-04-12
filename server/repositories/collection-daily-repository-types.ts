import type { SQLWrapper } from "drizzle-orm";

export type CollectionDailyQueryResult = {
  rows?: unknown[];
};

export type CollectionDailyExecutor = {
  execute: (query: SQLWrapper | string) => PromiseLike<CollectionDailyQueryResult>;
};

export type CollectionDailyUserRow = {
  id?: unknown;
  username?: unknown;
  role?: unknown;
};

export type CollectionDailyPaidCustomerRow = {
  id?: unknown;
  customer_name?: unknown;
  customer_name_encrypted?: unknown;
  account_number?: unknown;
  account_number_encrypted?: unknown;
  amount?: unknown;
  collection_staff_nickname?: unknown;
};
