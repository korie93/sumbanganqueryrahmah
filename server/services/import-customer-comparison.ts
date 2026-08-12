import crypto from "crypto";
import type {
  ImportComparisonCategory,
  ImportComparisonItem,
  ImportComparisonResponse,
  ImportComparisonSide,
} from "../../shared/common/import-comparison-contract";
import type {
  ImportComparisonDataset,
  ImportComparisonIdentity,
  ImportComparisonIdentityBasis,
} from "./import-customer-comparison-dataset";
export {
  collectImportComparisonDataset,
  ImportComparisonLimitError,
  importComparisonLimits,
} from "./import-customer-comparison-dataset";

type ComparisonPageInput = {
  baseline: ImportComparisonDataset;
  current: ImportComparisonDataset;
  category: ImportComparisonCategory;
  search: string;
  page: number;
  pageSize: number;
};

const MAX_ACTIVE_IMPORT_COMPARISONS = 1;
let activeImportComparisons = 0;

export class ImportComparisonBusyError extends Error {
  constructor() {
    super("Another saved file comparison is still running. Please retry shortly.");
    this.name = "ImportComparisonBusyError";
  }
}

export async function runWithImportComparisonCapacity<T>(
  operation: () => Promise<T>,
): Promise<T> {
  if (activeImportComparisons >= MAX_ACTIVE_IMPORT_COMPARISONS) {
    throw new ImportComparisonBusyError();
  }

  activeImportComparisons += 1;
  try {
    return await operation();
  } finally {
    activeImportComparisons = Math.max(0, activeImportComparisons - 1);
  }
}

function haveEqualAccountSets(
  left: ImportComparisonIdentity,
  right: ImportComparisonIdentity,
): boolean {
  if (left.accounts.size !== right.accounts.size) return false;
  for (const account of left.accounts.keys()) {
    if (!right.accounts.has(account)) return false;
  }
  return true;
}

function toSide(identity: ImportComparisonIdentity): ImportComparisonSide {
  return {
    customerName: identity.customerName,
    icNumber: identity.icNumber,
    customerPhone: identity.customerPhone,
    accountNumbers: Array.from(identity.accounts.values()),
    occurrences: identity.occurrences,
  };
}

function makeItem(
  category: Exclude<ImportComparisonCategory, "all">,
  basis: ImportComparisonIdentityBasis,
  baseline: ImportComparisonIdentity | null,
  current: ImportComparisonIdentity | null,
): ImportComparisonItem {
  const stableKey = `${category}|${baseline?.key ?? ""}|${current?.key ?? ""}`;
  return {
    id: crypto.createHash("sha256").update(stableKey).digest("hex").slice(0, 24),
    category,
    matchBasis: basis,
    baseline: baseline ? toSide(baseline) : null,
    current: current ? toSide(current) : null,
  };
}

function classifyExactPair(
  baseline: ImportComparisonIdentity,
  current: ImportComparisonIdentity,
  basis: ImportComparisonIdentityBasis,
): Exclude<ImportComparisonCategory, "all"> {
  const conflictingIc = Boolean(
    baseline.normalizedIc
    && current.normalizedIc
    && baseline.normalizedIc !== current.normalizedIc,
  );
  const conflictingName = Boolean(
    basis === "account"
    && baseline.normalizedName
    && current.normalizedName
    && baseline.normalizedName !== current.normalizedName,
  );
  const conflictingPhone = Boolean(
    basis === "account"
    && baseline.normalizedPhone
    && current.normalizedPhone
    && baseline.normalizedPhone !== current.normalizedPhone,
  );
  if (conflictingIc || conflictingName || conflictingPhone) {
    return "conflict";
  }
  if (
    baseline.accounts.size > 0
    && current.accounts.size > 0
    && !haveEqualAccountSets(baseline, current)
  ) {
    return "account_changed";
  }
  return "matched";
}

function findPhoneNameCandidates(
  baseline: ImportComparisonIdentity,
  currentByPhoneName: Map<string, ImportComparisonIdentity[]>,
  usedCurrentKeys: Set<string>,
): ImportComparisonIdentity[] {
  if (!baseline.normalizedPhone || !baseline.normalizedName) return [];
  const key = `${baseline.normalizedPhone}:${baseline.normalizedName}`;
  return (currentByPhoneName.get(key) ?? [])
    .filter((candidate) => !usedCurrentKeys.has(candidate.key))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function findAccountCandidates(
  baseline: ImportComparisonIdentity,
  currentByAccount: Map<string, ImportComparisonIdentity[]>,
  usedCurrentKeys: Set<string>,
): ImportComparisonIdentity[] {
  const candidates = new Map<string, ImportComparisonIdentity>();
  for (const account of baseline.accounts.keys()) {
    for (const candidate of currentByAccount.get(account) ?? []) {
      if (!usedCurrentKeys.has(candidate.key)) {
        candidates.set(candidate.key, candidate);
      }
    }
  }

  return Array.from(candidates.values()).sort((left, right) => {
    const leftPhoneMatch = Number(
      Boolean(baseline.normalizedPhone && baseline.normalizedPhone === left.normalizedPhone),
    );
    const rightPhoneMatch = Number(
      Boolean(baseline.normalizedPhone && baseline.normalizedPhone === right.normalizedPhone),
    );
    if (leftPhoneMatch !== rightPhoneMatch) return rightPhoneMatch - leftPhoneMatch;
    const leftNameMatch = Number(
      Boolean(baseline.normalizedName && baseline.normalizedName === left.normalizedName),
    );
    const rightNameMatch = Number(
      Boolean(baseline.normalizedName && baseline.normalizedName === right.normalizedName),
    );
    return rightNameMatch - leftNameMatch || left.key.localeCompare(right.key);
  });
}

function buildComparisonItems(
  baseline: ImportComparisonDataset,
  current: ImportComparisonDataset,
): ImportComparisonItem[] {
  const items: ImportComparisonItem[] = [];
  const usedCurrentKeys = new Set<string>();
  const currentByAccount = new Map<string, ImportComparisonIdentity[]>();
  const currentByPhoneName = new Map<string, ImportComparisonIdentity[]>();
  const baselineEntities = Array.from(baseline.entities.values())
    .sort((left, right) => left.key.localeCompare(right.key));
  const currentEntities = Array.from(current.entities.values())
    .sort((left, right) => left.key.localeCompare(right.key));

  for (const identity of currentEntities) {
    for (const account of identity.accounts.keys()) {
      const entries = currentByAccount.get(account) ?? [];
      entries.push(identity);
      currentByAccount.set(account, entries);
    }
    if (identity.normalizedPhone && identity.normalizedName) {
      const phoneNameKey = `${identity.normalizedPhone}:${identity.normalizedName}`;
      const entries = currentByPhoneName.get(phoneNameKey) ?? [];
      entries.push(identity);
      currentByPhoneName.set(phoneNameKey, entries);
    }
  }

  const unmatchedBaseline: ImportComparisonIdentity[] = [];
  for (const baselineIdentity of baselineEntities) {
    if (baselineIdentity.basis === "none") {
      items.push(makeItem("unidentified", "none", baselineIdentity, null));
      continue;
    }
    const currentIdentity = current.entities.get(baselineIdentity.key);
    if (!currentIdentity || currentIdentity.basis === "none") {
      unmatchedBaseline.push(baselineIdentity);
      continue;
    }
    usedCurrentKeys.add(currentIdentity.key);
    items.push(makeItem(
      classifyExactPair(baselineIdentity, currentIdentity, baselineIdentity.basis),
      baselineIdentity.basis,
      baselineIdentity,
      currentIdentity,
    ));
  }

  for (const baselineIdentity of unmatchedBaseline) {
    let basis: ImportComparisonIdentityBasis = "account";
    let candidates = findAccountCandidates(
      baselineIdentity,
      currentByAccount,
      usedCurrentKeys,
    );
    if (candidates.length === 0) {
      basis = "phone_and_name";
      candidates = findPhoneNameCandidates(
        baselineIdentity,
        currentByPhoneName,
        usedCurrentKeys,
      );
    }
    const currentIdentity = candidates[0];
    if (!currentIdentity) {
      items.push(makeItem("baseline_only", baselineIdentity.basis, baselineIdentity, null));
      continue;
    }

    usedCurrentKeys.add(currentIdentity.key);
    const ambiguousAccountOwner = candidates.length > 1;
    items.push(makeItem(
      ambiguousAccountOwner
        ? "conflict"
        : classifyExactPair(baselineIdentity, currentIdentity, basis),
      basis,
      baselineIdentity,
      currentIdentity,
    ));
  }

  for (const currentIdentity of currentEntities) {
    if (usedCurrentKeys.has(currentIdentity.key)) continue;
    items.push(makeItem(
      currentIdentity.basis === "none" ? "unidentified" : "current_only",
      currentIdentity.basis,
      null,
      currentIdentity,
    ));
  }

  return items;
}

function comparisonSearchText(item: ImportComparisonItem): string {
  const values = [
    item.baseline?.customerName,
    item.baseline?.icNumber,
    item.baseline?.customerPhone,
    ...(item.baseline?.accountNumbers ?? []),
    item.current?.customerName,
    item.current?.icNumber,
    item.current?.customerPhone,
    ...(item.current?.accountNumbers ?? []),
  ];
  return values
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .normalize("NFKD")
    .toLowerCase();
}

function itemSortKey(item: ImportComparisonItem): string {
  const categoryOrder: Record<Exclude<ImportComparisonCategory, "all">, string> = {
    conflict: "0",
    account_changed: "1",
    baseline_only: "2",
    current_only: "3",
    matched: "4",
    unidentified: "5",
  };
  const side = item.current ?? item.baseline;
  return `${categoryOrder[item.category]}|${side?.customerName ?? ""}|${side?.icNumber ?? ""}|${item.id}`
    .toLowerCase();
}

export function buildImportCustomerComparisonPage(
  input: ComparisonPageInput,
): Pick<ImportComparisonResponse, "summary" | "items" | "pagination" | "matching"> {
  const allItems = buildComparisonItems(input.baseline, input.current);
  const normalizedSearch = input.search.trim().normalize("NFKD").toLowerCase();
  const filteredItems = allItems
    .filter((item) => input.category === "all" || item.category === input.category)
    .filter((item) => !normalizedSearch || comparisonSearchText(item).includes(normalizedSearch))
    .sort((left, right) => itemSortKey(left).localeCompare(itemSortKey(right)));
  const pageSize = Math.max(1, input.pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const page = Math.min(Math.max(1, input.page), totalPages);
  const offset = (page - 1) * pageSize;

  const countCategory = (category: ImportComparisonItem["category"]) =>
    allItems.filter((item) => item.category === category).length;

  return {
    summary: {
      baselineIdentities: input.baseline.entities.size,
      currentIdentities: input.current.entities.size,
      matched: countCategory("matched"),
      accountChanged: countCategory("account_changed"),
      baselineOnly: countCategory("baseline_only"),
      currentOnly: countCategory("current_only"),
      conflicts: countCategory("conflict"),
      unidentified: countCategory("unidentified"),
      baselineDuplicateRows: Array.from(input.baseline.entities.values())
        .reduce((sum, item) => sum + Math.max(0, item.occurrences - 1), 0),
      currentDuplicateRows: Array.from(input.current.entities.values())
        .reduce((sum, item) => sum + Math.max(0, item.occurrences - 1), 0),
    },
    items: filteredItems.slice(offset, offset + pageSize),
    pagination: {
      mode: "offset",
      page,
      pageSize,
      total: filteredItems.length,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    matching: {
      strategy: "deterministic_customer_account_v1",
      identifiers: ["ic", "phone_and_name", "account", "none"],
    },
  };
}
