import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";
import { COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT } from "./collection-monthly-anomaly-utils";
import {
  buildCollectionMonthlyComparisonInsights,
} from "./collection-monthly-month-insight-utils";
import { buildCollectionMonthlyComparisonProjection } from "./collection-monthly-projection-utils";
import {
  buildCollectionMonthlyComparisonTargetSummary,
  type CollectionMonthlyComparisonTargetInput,
} from "./collection-monthly-target-utils";

export type CollectionMonthlyComparisonDataQualitySignal = {
  id: string;
  label: string;
  description: string;
  tone: "success" | "warning" | "danger" | "info";
};

export type CollectionMonthlyComparisonDataQualitySummary = {
  statusLabel: string;
  statusTone: "success" | "warning" | "danger" | "info";
  warningCount: number;
  signals: CollectionMonthlyComparisonDataQualitySignal[];
};

export function buildCollectionMonthlyComparisonDataQualitySummary(
  payload: CollectionMonthlyComparisonResponse,
  monthlyTargetAmount?: CollectionMonthlyComparisonTargetInput,
  referenceDate = new Date(),
): CollectionMonthlyComparisonDataQualitySummary {
  const insights = buildCollectionMonthlyComparisonInsights(payload);
  const targetSummary = buildCollectionMonthlyComparisonTargetSummary(payload, monthlyTargetAmount);
  const projection = buildCollectionMonthlyComparisonProjection(payload, monthlyTargetAmount, referenceDate);
  const signals: CollectionMonthlyComparisonDataQualitySignal[] = [];

  if (targetSummary) {
    signals.push({
      id: "target-configured",
      label: "Target configured",
      description: targetSummary.missingMonthCount > 0
        ? `${targetSummary.configuredMonthCount}/${payload.months.length} selected month(s) have superuser targets. Missing months are excluded from target progress.`
        : `${formatAmountRM(targetSummary.monthlyTargetAmount)} target is active for the target month, with all selected months configured.`,
      tone: "success",
    });
  } else {
    signals.push({
      id: "target-missing",
      label: "Target missing",
      description: "No superuser monthly target is available, so target status is hidden from calculations.",
      tone: "warning",
    });
  }

  if (insights.anomalyMonthCount > 0) {
    const firstAnomaly = insights.anomalyMonths[0];
    signals.push({
      id: "anomaly-months",
      label: `${insights.anomalyMonthCount} anomaly month(s)`,
      description: firstAnomaly?.anomalyLabel || "One or more months moved more than the audit threshold.",
      tone: "warning",
    });
  } else {
    signals.push({
      id: "no-anomaly",
      label: "Anomaly clear",
      description: `No month moved more than ${COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT}% against the previous month.`,
      tone: "success",
    });
  }

  if (insights.emptyMonthCount > 0) {
    const emptyLabels = insights.monthInsights
      .filter((month) => month.recordCount === 0)
      .slice(0, 2)
      .map((month) => month.label)
      .join(", ");
    signals.push({
      id: "empty-months",
      label: `${insights.emptyMonthCount} empty month(s)`,
      description: emptyLabels
        ? `Review empty month(s): ${emptyLabels}${insights.emptyMonthCount > 2 ? ", ..." : ""}.`
        : "Review empty months before sharing the report.",
      tone: "warning",
    });
  }

  if (insights.activeMonthCount >= 3) {
    const activeRecordAverage = insights.totalRecords / insights.activeMonthCount;
    const lowRecordMonths = insights.monthInsights.filter(
      (month) => month.recordCount > 0 && month.recordCount < activeRecordAverage * 0.5,
    );
    if (lowRecordMonths.length > 0) {
      signals.push({
        id: "low-record-volume",
        label: `${lowRecordMonths.length} low-volume month(s)`,
        description: `${lowRecordMonths[0]?.label || "A month"} has less than half the active-month average record count.`,
        tone: "info",
      });
    }
  }

  if (projection) {
    if (projection.status === "behind") {
      signals.push({
        id: "projection-behind",
        label: "Projection behind target",
        description: `${projection.label} is projected at ${formatAmountRM(projection.projectedTotal)}, below the configured target.`,
        tone: "warning",
      });
    } else if (projection.status === "on_track") {
      signals.push({
        id: "projection-on-track",
        label: "Projection on track",
        description: `${projection.label} is projected at ${formatAmountRM(projection.projectedTotal)}, meeting the configured target.`,
        tone: "success",
      });
    }
  }

  const warningCount = signals.filter((signal) => signal.tone === "warning" || signal.tone === "danger").length;
  const statusTone = warningCount >= 3 ? "danger" : warningCount > 0 ? "warning" : "success";
  const statusLabel = warningCount === 0
    ? "Quality checks clear"
    : warningCount === 1 ? "1 item needs review" : `${warningCount} items need review`;

  return {
    statusLabel,
    statusTone,
    warningCount,
    signals,
  };
}
