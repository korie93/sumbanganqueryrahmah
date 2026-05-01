import { badRequest } from "../../http/errors";
import {
  getAdminGroupNicknameValues,
  hasNicknameValue,
  resolveCurrentCollectionNicknameFromSession,
} from "../../routes/collection-access";
import {
  isValidCollectionMonthKey,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import {
  CollectionServiceSupport,
  type SummaryQuery,
} from "./collection-service-support";
import { getCollectionReportFreshness } from "./collection-report-freshness";

const COLLECTION_MONTHLY_COMPARISON_MAX_RANGE = 24;
const COLLECTION_SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

type ParsedCollectionMonth = {
  year: number;
  month: number;
  key: string;
  label: string;
};

function roundCollectionComparisonValue(value: number): number {
  return Number.parseFloat(Number(value || 0).toFixed(2));
}

function parseCollectionMonth(value: unknown): ParsedCollectionMonth | null {
  const normalized = normalizeCollectionText(value);
  if (!isValidCollectionMonthKey(normalized)) {
    return null;
  }

  const [yearRaw, monthRaw] = normalized.split("-");
  const year = Number.parseInt(yearRaw || "", 10);
  const month = Number.parseInt(monthRaw || "", 10);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return null;
  }

  return {
    year,
    month,
    key: `${yearRaw}-${monthRaw}`,
    label: `${COLLECTION_SHORT_MONTH_NAMES[month - 1]} ${year}`,
  };
}

function buildCollectionMonthRange(start: ParsedCollectionMonth, end: ParsedCollectionMonth) {
  const months: ParsedCollectionMonth[] = [];
  let year = start.year;
  let month = start.month;

  while (year < end.year || (year === end.year && month <= end.month)) {
    const monthText = String(month).padStart(2, "0");
    months.push({
      year,
      month,
      key: `${year}-${monthText}`,
      label: `${COLLECTION_SHORT_MONTH_NAMES[month - 1]} ${year}`,
    });

    month += 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }

    if (months.length > COLLECTION_MONTHLY_COMPARISON_MAX_RANGE) {
      break;
    }
  }

  return months;
}

function buildMonthBoundary(month: ParsedCollectionMonth): { from: string; to: string } {
  const from = `${month.key}-01`;
  const lastDay = new Date(month.year, month.month, 0).getDate();
  return {
    from,
    to: `${month.key}-${String(lastDay).padStart(2, "0")}`,
  };
}

export class CollectionRecordMonthlyComparisonOperations extends CollectionServiceSupport {
  async getMonthlyComparison(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: SummaryQuery,
  ) {
    const user = this.requireUser(userInput);
    const startMonth = parseCollectionMonth(query.startMonth);
    const endMonth = parseCollectionMonth(query.endMonth);
    if (!startMonth) {
      throw badRequest("Invalid start month.");
    }
    if (!endMonth) {
      throw badRequest("Invalid end month.");
    }

    const startSortKey = (startMonth.year * 100) + startMonth.month;
    const endSortKey = (endMonth.year * 100) + endMonth.month;
    if (startSortKey > endSortKey) {
      throw badRequest("Start month cannot be later than end month.");
    }

    const monthRange = buildCollectionMonthRange(startMonth, endMonth);
    if (monthRange.length > COLLECTION_MONTHLY_COMPARISON_MAX_RANGE) {
      throw badRequest("Monthly comparison range cannot exceed 24 months.");
    }

    const requestedNickname = normalizeCollectionText(query.nickname);
    let reportNickname = "";

    if (user.role === "superuser") {
      if (!requestedNickname) {
        throw badRequest("Staff nickname is required.");
      }
      const profile = await this.storage.getCollectionStaffNicknameByName(requestedNickname);
      if (!profile?.isActive) {
        throw badRequest("Invalid nickname filter.");
      }
      reportNickname = profile.nickname;
    } else if (user.role === "admin") {
      const allowedNicknames = await getAdminGroupNicknameValues(this.storage, user);
      if (!requestedNickname) {
        throw badRequest("Staff nickname is required.");
      }
      if (!hasNicknameValue(allowedNicknames, requestedNickname)) {
        throw badRequest("Invalid nickname filter.");
      }
      reportNickname = allowedNicknames.find((value) => value.toLowerCase() === requestedNickname.toLowerCase())
        || requestedNickname;
    } else {
      const currentNickname = normalizeCollectionText(
        await resolveCurrentCollectionNicknameFromSession(this.storage, user),
      );
      if (!currentNickname) {
        throw badRequest("Current staff nickname session could not be resolved.");
      }
      if (requestedNickname && requestedNickname.toLowerCase() !== currentNickname.toLowerCase()) {
        throw badRequest("Invalid nickname filter.");
      }
      reportNickname = currentNickname;
    }

    const startBoundary = buildMonthBoundary(startMonth);
    const endBoundary = buildMonthBoundary(endMonth);
    const aggregates = await this.storage.getCollectionMonthlyComparison({
      from: startBoundary.from,
      to: endBoundary.to,
      nicknames: [reportNickname],
    });
    const freshness = await getCollectionReportFreshness(this.storage, {
      from: startBoundary.from,
      to: endBoundary.to,
      nicknames: [reportNickname],
    });
    const byMonth = new Map(
      aggregates.map((entry) => [
        `${entry.year}-${String(entry.month).padStart(2, "0")}`,
        entry,
      ]),
    );
    const months = monthRange.map((month) => {
      const entry = byMonth.get(month.key);
      const totalCollection = roundCollectionComparisonValue(entry?.totalAmount ?? 0);
      const recordCount = Number(entry?.totalRecords ?? 0);
      return {
        month: month.key,
        label: month.label,
        totalCollection,
        recordCount,
        averagePerRecord: recordCount > 0
          ? roundCollectionComparisonValue(totalCollection / recordCount)
          : 0,
      };
    });

    const baseMonth = months.length > 1 ? months[0] : null;
    const targetMonth = months[months.length - 1];
    let comparison: {
      baseMonth: string | null;
      targetMonth: string;
      baseLabel: string | null;
      targetLabel: string;
      baseTotal: number | null;
      targetTotal: number;
      difference: number | null;
      percentageChange: number | null;
      direction: "increase" | "decrease" | "no_change" | "no_previous_data";
      summary: string;
    };

    if (!baseMonth) {
      comparison = {
        baseMonth: null,
        targetMonth: targetMonth.month,
        baseLabel: null,
        targetLabel: targetMonth.label,
        baseTotal: null,
        targetTotal: targetMonth.totalCollection,
        difference: null,
        percentageChange: null,
        direction: "no_previous_data",
        summary: "No previous month data available for comparison.",
      };
    } else {
      const difference = roundCollectionComparisonValue(
        targetMonth.totalCollection - baseMonth.totalCollection,
      );
      if (difference === 0) {
        comparison = {
          baseMonth: baseMonth.month,
          targetMonth: targetMonth.month,
          baseLabel: baseMonth.label,
          targetLabel: targetMonth.label,
          baseTotal: baseMonth.totalCollection,
          targetTotal: targetMonth.totalCollection,
          difference,
          percentageChange: 0,
          direction: "no_change",
          summary: "No change compared to the previous month.",
        };
      } else if (baseMonth.totalCollection <= 0 && targetMonth.totalCollection > 0) {
        comparison = {
          baseMonth: baseMonth.month,
          targetMonth: targetMonth.month,
          baseLabel: baseMonth.label,
          targetLabel: targetMonth.label,
          baseTotal: baseMonth.totalCollection,
          targetTotal: targetMonth.totalCollection,
          difference,
          percentageChange: null,
          direction: "increase",
          summary: `Collection increased by RM${difference.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} compared to ${baseMonth.label}. No previous month total is available for percentage comparison.`,
        };
      } else {
        const percentageChange = baseMonth.totalCollection > 0
          ? roundCollectionComparisonValue((difference / baseMonth.totalCollection) * 100)
          : null;
        const direction = difference > 0 ? "increase" : "decrease";
        const absoluteDifference = Math.abs(difference);
        const percentageLabel = percentageChange === null
          ? ""
          : ` (${percentageChange > 0 ? "+" : ""}${percentageChange.toFixed(2)}%)`;
        comparison = {
          baseMonth: baseMonth.month,
          targetMonth: targetMonth.month,
          baseLabel: baseMonth.label,
          targetLabel: targetMonth.label,
          baseTotal: baseMonth.totalCollection,
          targetTotal: targetMonth.totalCollection,
          difference,
          percentageChange,
          direction,
          summary: `Collection ${direction === "increase" ? "increased" : "decreased"} by RM${absoluteDifference.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${percentageLabel} compared to ${baseMonth.label}.`,
        };
      }
    }

    return {
      ok: true as const,
      nickname: reportNickname,
      startMonth: startMonth.key,
      endMonth: endMonth.key,
      months,
      comparison,
      freshness,
    };
  }
}
