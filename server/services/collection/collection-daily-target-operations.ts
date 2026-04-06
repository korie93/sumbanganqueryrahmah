import { normalizeCollectionText } from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";

export async function getDailyTargetForOwner(
  storage: CollectionStoragePort,
  username: string,
  year: number,
  month: number,
  fallbackUsernames: string[] = [],
) {
  const normalizedFallbacks = Array.from(
    new Set(
      fallbackUsernames
        .map((value) => normalizeCollectionText(value).toLowerCase())
        .filter((value) => value && value !== username.toLowerCase()),
    ),
  );

  const directTarget = await storage.getCollectionDailyTarget({ username, year, month });
  if (directTarget) {
    return directTarget;
  }

  for (const fallbackUsername of normalizedFallbacks) {
    const fallbackTarget = await storage.getCollectionDailyTarget({
      username: fallbackUsername,
      year,
      month,
    });
    if (fallbackTarget) {
      return fallbackTarget;
    }
  }

  return undefined;
}
