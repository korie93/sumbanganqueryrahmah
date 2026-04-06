import { normalizeCollectionText } from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";
import {
  createDailySummaryEntry,
  DAILY_OVERVIEW_FALLBACK_PAGE_SIZE,
  roundDailyOverviewMoney,
  type DailySummaryEntry,
} from "./collection-daily-overview-shared";

export async function loadDailySummaryFallbackRecords(
  storage: CollectionStoragePort,
  params: {
    from: string;
    to: string;
    nickname: string;
  },
) {
  const records: Awaited<ReturnType<CollectionStoragePort["listCollectionRecords"]>> = [];
  let offset = 0;

  for (;;) {
    const batch = await storage.listCollectionRecords({
      from: params.from,
      to: params.to,
      nicknames: [params.nickname],
      limit: DAILY_OVERVIEW_FALLBACK_PAGE_SIZE,
      offset,
    });

    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    records.push(...batch);

    if (batch.length < DAILY_OVERVIEW_FALLBACK_PAGE_SIZE) {
      break;
    }

    offset += batch.length;
  }

  return records;
}

export async function buildDailySummaryMaps(
  storage: CollectionStoragePort,
  params: {
    from: string;
    to: string;
    username: string;
  },
): Promise<DailySummaryEntry> {
  const nickname = String(params.username || "").trim();
  const summaryRows =
    typeof storage.summarizeCollectionRecordsByNicknameAndPaymentDate === "function"
      ? await storage.summarizeCollectionRecordsByNicknameAndPaymentDate({
          from: params.from,
          to: params.to,
          nicknames: [nickname],
        })
      : null;

  const amountByDate = new Map<string, number>();
  const customerCountByDate = new Map<string, number>();

  if (Array.isArray(summaryRows)) {
    for (const row of summaryRows) {
      const key = String(row.paymentDate || "");
      if (!key) continue;
      amountByDate.set(key, roundDailyOverviewMoney(Number(row.totalAmount || 0)));
      customerCountByDate.set(key, Number(row.totalRecords || 0));
    }
    return {
      amountByDate,
      customerCountByDate,
    };
  }

  const records = await loadDailySummaryFallbackRecords(storage, {
    from: params.from,
    to: params.to,
    nickname,
  });

  for (const record of records) {
    const key = record.paymentDate;
    const amount = Number(record.amount || 0);
    amountByDate.set(
      key,
      roundDailyOverviewMoney((amountByDate.get(key) || 0) + (Number.isFinite(amount) ? amount : 0)),
    );
    customerCountByDate.set(key, (customerCountByDate.get(key) || 0) + 1);
  }

  return {
    amountByDate,
    customerCountByDate,
  };
}

export async function buildDailySummaryMapsByUsername(
  storage: CollectionStoragePort,
  params: {
    from: string;
    to: string;
    usernames: string[];
  },
): Promise<Map<string, DailySummaryEntry>> {
  const normalizedUsernames = Array.from(
    new Set(
      params.usernames
        .map((value) => normalizeCollectionText(value))
        .filter(Boolean),
    ),
  );
  const summaryByUsername = new Map<string, DailySummaryEntry>(
    normalizedUsernames.map((username) => [
      username.toLowerCase(),
      createDailySummaryEntry(),
    ]),
  );

  if (
    normalizedUsernames.length > 0
    && typeof storage.summarizeCollectionRecordsByNicknameAndPaymentDate === "function"
  ) {
    const summaryRows = await storage.summarizeCollectionRecordsByNicknameAndPaymentDate({
      from: params.from,
      to: params.to,
      nicknames: normalizedUsernames,
    });

    for (const row of summaryRows) {
      const nicknameKey = normalizeCollectionText(row.nickname).toLowerCase();
      if (!nicknameKey || !summaryByUsername.has(nicknameKey)) continue;
      const dateKey = String(row.paymentDate || "");
      if (!dateKey) continue;
      const summaryEntry = summaryByUsername.get(nicknameKey)!;
      summaryEntry.amountByDate.set(dateKey, roundDailyOverviewMoney(Number(row.totalAmount || 0)));
      summaryEntry.customerCountByDate.set(dateKey, Number(row.totalRecords || 0));
    }

    return summaryByUsername;
  }

  const fallbackEntries = await Promise.all(
    normalizedUsernames.map(async (username) => [
      username.toLowerCase(),
      await buildDailySummaryMaps(storage, {
        from: params.from,
        to: params.to,
        username,
      }),
    ] as const),
  );

  return new Map(fallbackEntries);
}
