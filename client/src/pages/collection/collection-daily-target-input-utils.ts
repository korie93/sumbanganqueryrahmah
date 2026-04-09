import { formatCollectionAmountMyrString } from "@shared/collection-amount-types";

export function formatCollectionDailyTargetInput(value: unknown): string {
  return formatCollectionAmountMyrString(value);
}
