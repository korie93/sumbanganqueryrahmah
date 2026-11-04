import { normalizeCollectionMonthInputValue } from "./collection-monthly-format-utils";

export function resolveCollectionMonthFieldCommitValue(value: string, finalize: boolean): string | null {
  if (!finalize && !/^\d{4}-\d{2}$/.test(value.trim())) {
    return null;
  }
  return normalizeCollectionMonthInputValue(value);
}
