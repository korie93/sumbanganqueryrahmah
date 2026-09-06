export const COLLECTION_OSP_AGINGS = ["D3", "D4", "D5", "D6"] as const;

export type CollectionOspReconciliationAging = (typeof COLLECTION_OSP_AGINGS)[number];

export type CollectionOspSystemPaymentEvent = {
  id: string;
  date: string;
  amount: string;
};

export type CollectionOspManualPaymentState = {
  amount: string;
  asOfDate: string;
  actualPaymentDate?: string | null;
  active: boolean;
};

export type CollectionOspReconciliationAccountInput = {
  targetRevisionId: string;
  cycleKey: string;
  aging: CollectionOspReconciliationAging;
  totalDue: string;
  billingPrincipalOsp: string;
  systemPayments: CollectionOspSystemPaymentEvent[];
  systemAbortDate?: string | null;
  manual?: CollectionOspManualPaymentState | null;
  asOfDate: string;
};

export type CollectionOspReconciliationAccountResult = {
  targetRevisionId: string;
  cycleKey: string;
  aging: CollectionOspReconciliationAging;
  totalDue: string;
  billingPrincipalOsp: string;
  systemCumulative: string;
  manualPriorAmount: string;
  reconciledCumulative: string;
  remainingAmount: string;
  systemClosed: boolean;
  reconciledClosed: boolean;
  systemAbortDate: string | null;
  effectiveClosureDate: string | null;
  manualEffectiveDate: string | null;
  contributionSource: "SYSTEM_ABORT_CP" | "MANUAL_VERIFIED_ABORT" | "OPEN";
  manualSuperseded: boolean;
};

function normalizeDate(value: unknown): string | null {
  const date = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}

export function parseCollectionOspMoneyCents(value: unknown, allowZero = true): bigint {
  const input = String(value ?? "").trim();
  // Accept either an ungrouped decimal or conventional 3-digit grouping. Do
  // not silently reinterpret malformed values such as `1,2,3` as RM123.00.
  const validMoney = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
  if (!validMoney.test(input)) {
    throw new Error("Collection OSP money must be an exact non-negative decimal with at most two decimals.");
  }
  const raw = input.replace(/,/g, "");
  const [whole, fraction = ""] = raw.split(".");
  const cents = (BigInt(whole!) * 100n) + BigInt(`${fraction}00`.slice(0, 2));
  if (!allowZero && cents <= 0n) {
    throw new Error("Collection OSP money must be greater than zero.");
  }
  return cents;
}

export function formatCollectionOspMoneyCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function normalizeCollectionOspTargetPercentage(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!/^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/.test(raw)) {
    throw new Error("Target percentage is invalid.");
  }
  const [whole, fraction = ""] = raw.split(".");
  return `${BigInt(whole!)}.${fraction.padEnd(4, "0")}`;
}

/** Exact NUMERIC-compatible half-up rounding to sen. No binary-float money. */
export function calculateCollectionOspPercentageAmount(baseline: string, percentage: string): string {
  const baselineCents = parseCollectionOspMoneyCents(baseline);
  const units = BigInt(normalizeCollectionOspTargetPercentage(percentage).replace(".", ""));
  return formatCollectionOspMoneyCents((baselineCents * units + 500_000n) / 1_000_000n);
}

/** TABLE A and private TABLE B use their respective TARGET, never TT OSP. */
export function calculateCollectionOspBalance(targetOsp: string, ospClosed: string): string {
  return formatCollectionOspMoneyCents(
    parseCollectionOspMoneyCents(targetOsp) - parseCollectionOspMoneyCents(ospClosed),
  );
}

export function formatCollectionOspPercentage(numeratorCents: bigint, denominatorCents: bigint): string {
  if (denominatorCents <= 0n || numeratorCents <= 0n) return "0.0000";
  // Percentage with four decimal places: ratio * 100 * 10,000.
  const scaledNumerator = numeratorCents * 1_000_000n;
  const rounded = (scaledNumerator + (denominatorCents / 2n)) / denominatorCents;
  return `${rounded / 10_000n}.${String(rounded % 10_000n).padStart(4, "0")}`;
}

function stableEventOrder(
  left: { date: string; order: number; id: string },
  right: { date: string; order: number; id: string },
): number {
  return left.date.localeCompare(right.date)
    || left.order - right.order
    || left.id.localeCompare(right.id);
}

export function reconcileCollectionOspAccount(
  input: CollectionOspReconciliationAccountInput,
): CollectionOspReconciliationAccountResult {
  const asOfDate = normalizeDate(input.asOfDate);
  if (!asOfDate) throw new Error("Reconciliation as-of date is invalid.");
  const totalDueCents = parseCollectionOspMoneyCents(input.totalDue, false);
  const ospCents = parseCollectionOspMoneyCents(input.billingPrincipalOsp, true);
  const hasSystemAbortDate = input.systemAbortDate != null
    && String(input.systemAbortDate).trim().length > 0;
  const systemAbortDate = normalizeDate(input.systemAbortDate);
  if (hasSystemAbortDate && !systemAbortDate) {
    throw new Error("System ABORT date is invalid.");
  }
  const systemClosed = Boolean(systemAbortDate && systemAbortDate <= asOfDate);
  const eligibleSystemEvents = input.systemPayments
    .map((event) => {
      const date = normalizeDate(event.date);
      if (!date) throw new Error("System payment date is invalid.");
      return {
        date,
        id: String(event.id),
        order: 1,
        amountCents: parseCollectionOspMoneyCents(event.amount, false),
      };
    })
    .filter((event) => event.date <= asOfDate)
    .sort(stableEventOrder);

  const systemCumulativeCents = eligibleSystemEvents.reduce(
    (total, event) => total + event.amountCents,
    0n,
  );
  const hasActualPaymentDate = input.manual?.actualPaymentDate != null
    && String(input.manual.actualPaymentDate).trim().length > 0;
  const actualPaymentDate = hasActualPaymentDate
    ? normalizeDate(input.manual?.actualPaymentDate)
    : null;
  if (input.manual?.active && hasActualPaymentDate && !actualPaymentDate) {
    throw new Error("Manual actual payment date is invalid.");
  }
  const manualDate = input.manual?.active
    ? actualPaymentDate || normalizeDate(input.manual.asOfDate)
    : null;
  if (input.manual?.active && !manualDate) {
    throw new Error("Manual reconciliation date is invalid.");
  }
  const configuredManualCents = input.manual?.active
    ? parseCollectionOspMoneyCents(input.manual.amount, false)
    : 0n;
  const manualCents = input.manual?.active && manualDate && manualDate <= asOfDate
    ? configuredManualCents
    : 0n;
  // A Manual Verified settlement is a dated financial assertion. Validate it
  // against the System position that existed on that date, just as View
  // Collection does. A later CP payment may change today's System cumulative,
  // but it must not retroactively make an insufficient POOL assertion valid.
  const systemEventsAtManualDate = manualDate
    ? eligibleSystemEvents.filter((event) => event.date <= manualDate)
    : [];
  const systemCumulativeAtManualDateCents = systemEventsAtManualDate.reduce(
    (total, event) => total + event.amountCents,
    0n,
  );
  const manualThresholdEvents = [
    ...systemEventsAtManualDate,
    ...(manualCents > 0n && manualDate
      ? [{ date: manualDate, id: "manual", order: 0, amountCents: manualCents }]
      : []),
  ].sort(stableEventOrder);

  // Threshold is evaluated after all events on a business date. This avoids an
  // arbitrary within-day ordering changing the effective closure date.
  const totalsByDate = new Map<string, bigint>();
  for (const event of manualThresholdEvents) {
    totalsByDate.set(event.date, (totalsByDate.get(event.date) ?? 0n) + event.amountCents);
  }
  let running = 0n;
  let effectiveClosureDate: string | null = null;
  for (const [date, amount] of Array.from(totalsByDate.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    running += amount;
    if (running >= totalDueCents) {
      effectiveClosureDate = date;
      break;
    }
  }

  const reconciledCumulativeCents = systemCumulativeCents + manualCents;
  // Reconciled is the union of factual System ABORT accounts and accounts
  // proven closed by an active manual-prior-payment reconciliation. Merely
  // observing a cumulative amount at/above due must never manufacture a
  // Reconciled closure when neither governed path exists (for example, in
  // incomplete legacy data whose raw rows all remain CP).
  const manualProvesClosure = manualCents > 0n
    && systemCumulativeAtManualDateCents + manualCents >= totalDueCents;
  const reconciledClosed = systemClosed || manualProvesClosure;
  const reconciledClosureDate = [
    systemClosed ? systemAbortDate : null,
    manualProvesClosure ? effectiveClosureDate : null,
  ]
    .filter((date): date is string => Boolean(date))
    .sort((left, right) => left.localeCompare(right))[0] ?? null;
  const remainingCents = totalDueCents > reconciledCumulativeCents
    ? totalDueCents - reconciledCumulativeCents
    : 0n;
  const contributionSource = systemClosed
    ? "SYSTEM_ABORT_CP" as const
    : reconciledClosed && manualCents > 0n
      ? "MANUAL_VERIFIED_ABORT" as const
      : "OPEN" as const;

  return {
    targetRevisionId: input.targetRevisionId,
    cycleKey: input.cycleKey,
    aging: input.aging,
    totalDue: formatCollectionOspMoneyCents(totalDueCents),
    billingPrincipalOsp: formatCollectionOspMoneyCents(ospCents),
    systemCumulative: formatCollectionOspMoneyCents(systemCumulativeCents),
    manualPriorAmount: formatCollectionOspMoneyCents(manualCents),
    reconciledCumulative: formatCollectionOspMoneyCents(reconciledCumulativeCents),
    remainingAmount: formatCollectionOspMoneyCents(remainingCents),
    systemClosed,
    reconciledClosed,
    systemAbortDate: systemClosed ? systemAbortDate : null,
    effectiveClosureDate: reconciledClosed ? reconciledClosureDate : null,
    manualEffectiveDate: manualCents > 0n ? manualDate : null,
    contributionSource,
    manualSuperseded: systemClosed && manualCents > 0n,
  };
}

export type CollectionOspAggregateRow = {
  aging: CollectionOspReconciliationAging | "ALL";
  ospClosed: string;
  closedAccountCount: number;
  resultPercentage: string;
};

export function aggregateCollectionOspReconciliation(
  results: CollectionOspReconciliationAccountResult[],
  baselines: Partial<Record<CollectionOspReconciliationAging, string>>,
  mode: "system" | "manual" | "reconciled",
): CollectionOspAggregateRow[] {
  const unique = new Map<string, CollectionOspReconciliationAccountResult>();
  for (const result of results) {
    const key = `${result.targetRevisionId}:${result.cycleKey}`;
    const existing = unique.get(key);
    if (existing && (
      existing.aging !== result.aging
      || existing.billingPrincipalOsp !== result.billingPrincipalOsp
      || existing.totalDue !== result.totalDue
    )) {
      throw new Error("A target cycle contains inconsistent trusted OSP snapshots.");
    }
    if (!existing) unique.set(key, result);
  }

  const rows = COLLECTION_OSP_AGINGS.map((aging): CollectionOspAggregateRow => {
    const qualifying = Array.from(unique.values()).filter((result) => {
      if (result.aging !== aging) return false;
      if (mode === "system") return result.systemClosed;
      if (mode === "manual") return result.contributionSource === "MANUAL_VERIFIED_ABORT";
      return result.reconciledClosed;
    });
    const closed = qualifying.reduce(
      (total, result) => total + parseCollectionOspMoneyCents(result.billingPrincipalOsp),
      0n,
    );
    const baseline = parseCollectionOspMoneyCents(baselines[aging] ?? "0.00");
    return {
      aging,
      ospClosed: formatCollectionOspMoneyCents(closed),
      closedAccountCount: qualifying.length,
      resultPercentage: formatCollectionOspPercentage(closed, baseline),
    };
  });
  const allClosed = rows.reduce((total, row) => total + parseCollectionOspMoneyCents(row.ospClosed), 0n);
  const allBaseline = COLLECTION_OSP_AGINGS.reduce(
    (total, aging) => total + parseCollectionOspMoneyCents(baselines[aging] ?? "0.00"),
    0n,
  );
  rows.push({
    aging: "ALL",
    ospClosed: formatCollectionOspMoneyCents(allClosed),
    closedAccountCount: rows.reduce((total, row) => total + row.closedAccountCount, 0),
    resultPercentage: formatCollectionOspPercentage(allClosed, allBaseline),
  });
  return rows;
}

export type CollectionOspCalendarMovement = {
  date: string;
  systemDailyOsp: string;
  manualDailyOsp: string;
  reconciledDailyOsp: string;
  systemCumulativeOsp: string;
  manualCumulativeOsp: string;
  reconciledCumulativeOsp: string;
  systemDailyAccounts: number;
  manualDailyAccounts: number;
  reconciledDailyAccounts: number;
};

export function buildCollectionOspReconciliationCalendar(
  results: CollectionOspReconciliationAccountResult[],
  month: string,
): CollectionOspCalendarMovement[] {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Calendar month is invalid.");
  const first = new Date(`${month}-01T00:00:00.000Z`);
  if (!Number.isFinite(first.getTime()) || first.toISOString().slice(0, 7) !== month) {
    throw new Error("Calendar month is invalid.");
  }
  const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  const dayCount = Math.round((next.getTime() - first.getTime()) / 86_400_000);
  const unique = new Map<string, CollectionOspReconciliationAccountResult>();
  for (const result of results) {
    const key = `${result.targetRevisionId}:${result.cycleKey}`;
    if (!unique.has(key)) unique.set(key, result);
  }

  type MutableDay = {
    system: bigint;
    manual: bigint;
    reconciled: bigint;
    systemCount: number;
    manualCount: number;
    reconciledCount: number;
  };
  const movements = new Map<string, MutableDay>();
  const getDay = (date: string) => {
    const current = movements.get(date) ?? {
      system: 0n,
      manual: 0n,
      reconciled: 0n,
      systemCount: 0,
      manualCount: 0,
      reconciledCount: 0,
    };
    movements.set(date, current);
    return current;
  };
  for (const result of unique.values()) {
    const osp = parseCollectionOspMoneyCents(result.billingPrincipalOsp);
    if (result.systemClosed && result.systemAbortDate) {
      const day = getDay(result.systemAbortDate);
      day.system += osp;
      day.systemCount += 1;
    }
    // A later factual System ABORT owns the current contribution, but it must
    // not erase the earlier calendar fact that the manual reconciliation was
    // what first established closure. Keep that historical movement while the
    // reconciled union still contributes the account only once.
    const manualEstablishedEarlierClosure = result.manualPriorAmount !== "0.00"
      && result.effectiveClosureDate !== null
      && result.effectiveClosureDate !== result.systemAbortDate;
    if (
      (result.contributionSource === "MANUAL_VERIFIED_ABORT" || manualEstablishedEarlierClosure)
      && result.effectiveClosureDate
    ) {
      const day = getDay(result.effectiveClosureDate);
      day.manual += osp;
      day.manualCount += 1;
    }
    if (result.reconciledClosed && result.effectiveClosureDate) {
      const day = getDay(result.effectiveClosureDate);
      day.reconciled += osp;
      day.reconciledCount += 1;
    }
  }

  let systemCumulative = 0n;
  let manualCumulative = 0n;
  let reconciledCumulative = 0n;
  const output: CollectionOspCalendarMovement[] = [];
  for (let day = 1; day <= dayCount; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const movement = movements.get(date) ?? {
      system: 0n,
      manual: 0n,
      reconciled: 0n,
      systemCount: 0,
      manualCount: 0,
      reconciledCount: 0,
    };
    systemCumulative += movement.system;
    manualCumulative += movement.manual;
    reconciledCumulative += movement.reconciled;
    output.push({
      date,
      systemDailyOsp: formatCollectionOspMoneyCents(movement.system),
      manualDailyOsp: formatCollectionOspMoneyCents(movement.manual),
      reconciledDailyOsp: formatCollectionOspMoneyCents(movement.reconciled),
      systemCumulativeOsp: formatCollectionOspMoneyCents(systemCumulative),
      manualCumulativeOsp: formatCollectionOspMoneyCents(manualCumulative),
      reconciledCumulativeOsp: formatCollectionOspMoneyCents(reconciledCumulative),
      systemDailyAccounts: movement.systemCount,
      manualDailyAccounts: movement.manualCount,
      reconciledDailyAccounts: movement.reconciledCount,
    });
  }
  return output;
}
