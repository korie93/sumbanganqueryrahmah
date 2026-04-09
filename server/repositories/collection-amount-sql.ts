import { sql, type SQL } from "drizzle-orm";

// Collection records store the primary paid amount in MYR numeric(14,2),
// while receipt validation stores minor units in bigint cents. Centralize the
// SQL conversion to keep comparisons consistent anywhere both worlds meet.
export function buildCollectionAmountMyrToCentsSql(amountExpression: SQL): SQL {
  return sql`ROUND((${amountExpression}) * 100)::bigint`;
}
