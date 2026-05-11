import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";
import { COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT } from "./collection-monthly-anomaly-utils";
import {
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonMonthDelta,
  formatCollectionMonthlyComparisonPercentage,
} from "./collection-monthly-format-utils";
import { buildCollectionMonthlyComparisonTrendExplanation } from "./collection-monthly-insight-utils";
import {
  buildCollectionMonthlyComparisonTargetSummary,
  resolveCollectionMonthlyComparisonTargetForMonth,
  type CollectionMonthlyComparisonTargetInput,
  type CollectionMonthlyComparisonTargetLookup,
} from "./collection-monthly-target-utils";
import {
  escapeCollectionMonthlyComparisonCsvValue,
  escapeCollectionMonthlyComparisonHtml,
  formatCollectionMonthlyComparisonReportDate,
} from "./collection-monthly-export-utils";
import {
  buildCollectionSameDayPacePointInsights,
  buildCollectionSameDayPacePointTrendLabel,
  type CollectionSameDayPaceComparison,
} from "./collection-monthly-same-day-utils";
import {
  buildCollectionMonthlyComparisonBenchmarks,
  buildCollectionMonthlyComparisonDataQualitySummary,
  buildCollectionMonthlyComparisonInsights,
  buildCollectionMonthlyComparisonProjection,
  type CollectionMonthlyComparisonInsights,
} from "./collection-monthly-summary-utils";

export type CollectionMonthlyComparisonCsvOptions = {
  monthlyTargetAmount?: number | null | undefined;
  monthlyTargetsByMonth?: CollectionMonthlyComparisonTargetLookup | undefined;
  sameDayPace?: CollectionSameDayPaceComparison | null | undefined;
};

function isCollectionMonthlyComparisonCsvOptions(
  options: number | null | undefined | CollectionMonthlyComparisonCsvOptions,
): options is CollectionMonthlyComparisonCsvOptions {
  return Boolean(
    options
    && typeof options === "object"
    && ("monthlyTargetAmount" in options || "monthlyTargetsByMonth" in options || "sameDayPace" in options),
  );
}

function resolveCollectionMonthlyComparisonCsvTargetInput(
  options: number | null | undefined | CollectionMonthlyComparisonCsvOptions,
): CollectionMonthlyComparisonTargetInput {
  if (isCollectionMonthlyComparisonCsvOptions(options)) {
    return options.monthlyTargetsByMonth ?? options.monthlyTargetAmount ?? null;
  }

  return options as number | null | undefined;
}

function resolveCollectionMonthlyComparisonCsvSameDayPace(
  options: number | null | undefined | CollectionMonthlyComparisonCsvOptions,
): CollectionSameDayPaceComparison | null {
  if (isCollectionMonthlyComparisonCsvOptions(options)) {
    return options.sameDayPace ?? null;
  }

  return null;
}

export function buildCollectionMonthlyComparisonCsv(
  payload: CollectionMonthlyComparisonResponse,
  options?: number | null | CollectionMonthlyComparisonCsvOptions,
): string {
  const insights = buildCollectionMonthlyComparisonInsights(payload);
  const targetInput = resolveCollectionMonthlyComparisonCsvTargetInput(options);
  const sameDayPace = resolveCollectionMonthlyComparisonCsvSameDayPace(options);
  const headers = [
    "Nickname",
    "Month",
    "Month Label",
    "Total Collection",
    "Record Count",
    "Average Per Record",
    "Share Of Range",
    "Difference From Previous",
    "Percentage From Previous",
    "Anomaly Status",
    "Anomaly Direction",
    "Anomaly Threshold Percent",
    "Monthly Target",
    "Target Difference",
    "Target Progress %",
    "Target Status",
  ];
  const rows = insights.monthInsights.map((month) => {
    const target = resolveCollectionMonthlyComparisonTargetForMonth(month.month, targetInput);
    const targetDifference = target === null ? null : month.totalCollection - target;
    const targetProgress = target === null ? null : (month.totalCollection / target) * 100;
    const targetStatus = target === null
      ? "No target configured"
      : month.totalCollection >= target ? "At or above target" : "Below target";

    return [
      payload.nickname,
      month.month,
      month.label,
      month.totalCollection.toFixed(2),
      month.recordCount,
      month.averagePerRecord.toFixed(2),
      (month.shareOfRangeTotal * 100).toFixed(2),
      month.deltaFromPrevious === null ? "" : month.deltaFromPrevious.toFixed(2),
      month.percentageFromPrevious === null ? "" : month.percentageFromPrevious.toFixed(2),
      month.anomalyLabel || "",
      month.anomalyDirection || "",
      COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT.toFixed(2),
      target === null ? "" : target.toFixed(2),
      targetDifference === null ? "" : targetDifference.toFixed(2),
      targetProgress === null ? "" : targetProgress.toFixed(2),
      targetStatus,
    ];
  });

  const monthlySection = [
    headers.map(escapeCollectionMonthlyComparisonCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCollectionMonthlyComparisonCsvValue).join(",")),
  ];

  if (!sameDayPace) {
    return monthlySection.join("\n");
  }

  const sameDayHeaders = [
    "Date",
    "Month",
    "Daily Collection",
    "Cumulative Collection",
    "Previous Month Date",
    "Previous Month",
    "Previous Month Daily Collection",
    "Previous Month Cumulative Collection",
    "Daily Difference",
    "Cumulative Difference",
    "Current Monthly Target",
    "Previous Monthly Target",
    "Target Progress %",
    "Workday/Holiday Status",
    "Previous Workday/Holiday Status",
    "Pace Status",
    "Pace Insight",
  ];
  const sameDayRows = sameDayPace.points.map((point) => {
    const target = sameDayPace.target?.monthlyTargetAmount ?? null;
    const targetProgress = target === null ? null : (point.currentCumulative / target) * 100;
    const pointInsights = buildCollectionSameDayPacePointInsights(point, sameDayPace);
    return [
      point.currentDate,
      sameDayPace.currentLabel,
      point.currentAmount.toFixed(2),
      point.currentCumulative.toFixed(2),
      point.previousDate,
      sameDayPace.previousLabel,
      point.previousAmount.toFixed(2),
      point.previousCumulative.toFixed(2),
      point.dailyDifference.toFixed(2),
      point.cumulativeDifference.toFixed(2),
      target === null ? "" : target.toFixed(2),
      sameDayPace.previousMonthlyTargetAmount === null ? "" : sameDayPace.previousMonthlyTargetAmount.toFixed(2),
      targetProgress === null ? "" : targetProgress.toFixed(2),
      point.currentStatus.label,
      point.previousStatus.label,
      buildCollectionSameDayPacePointTrendLabel(point),
      pointInsights[0] || "",
    ];
  });

  return [
    ...monthlySection,
    "",
    escapeCollectionMonthlyComparisonCsvValue("Same-Day Pace Detail"),
    sameDayHeaders.map(escapeCollectionMonthlyComparisonCsvValue).join(","),
    ...sameDayRows.map((row) => row.map(escapeCollectionMonthlyComparisonCsvValue).join(",")),
  ].join("\n");
}

export function buildCollectionMonthlyComparisonCsvFilename(
  payload: CollectionMonthlyComparisonResponse,
): string {
  const safeNickname = String(payload.nickname || "staff")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "staff";
  return `SQR-monthly-comparison-${safeNickname}-${payload.startMonth}-to-${payload.endMonth}.csv`;
}

function buildCollectionMonthlyComparisonReportChartSvg(
  insights: CollectionMonthlyComparisonInsights,
  monthlyTargetInput: CollectionMonthlyComparisonTargetInput,
): string {
  const width = 760;
  const height = 260;
  const padding = { top: 22, right: 22, bottom: 44, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxCollection = Math.max(0, ...insights.monthInsights.map((month) => month.totalCollection));
  const maxTarget = Math.max(
    0,
    ...insights.monthInsights.map((month) => (
      resolveCollectionMonthlyComparisonTargetForMonth(month.month, monthlyTargetInput) || 0
    )),
  );
  const maxValue = Math.max(maxCollection, maxTarget, 1);
  const scaleMax = maxValue * 1.12;
  const slotWidth = plotWidth / Math.max(1, insights.monthInsights.length);
  const barWidth = Math.max(16, Math.min(44, slotWidth * 0.58));

  const bars = insights.monthInsights.map((month, index) => {
    const barHeight = Math.max(2, (month.totalCollection / scaleMax) * plotHeight);
    const x = padding.left + (slotWidth * index) + ((slotWidth - barWidth) / 2);
    const y = padding.top + plotHeight - barHeight;
    const fill = month.isAnomaly
      ? month.anomalyDirection === "decrease" ? "#dc2626" : "#d97706"
      : month.isTargetMonth ? "#047857" : "#2563eb";
    const label = escapeCollectionMonthlyComparisonHtml(month.label.replace(/\s+\d{4}$/, ""));
    return [
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="6" fill="${fill}" />`,
      `<text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 18}" text-anchor="middle" font-size="11" fill="#475569">${label}</text>`,
    ].join("");
  }).join("");

  const targetMarks = insights.monthInsights.map((month, index) => {
    const target = resolveCollectionMonthlyComparisonTargetForMonth(month.month, monthlyTargetInput);
    if (target === null) {
      return "";
    }
    const x = padding.left + (slotWidth * index) + Math.max(4, (slotWidth - barWidth) / 2);
    const y = padding.top + plotHeight - ((target / scaleMax) * plotHeight);
    const markWidth = Math.max(22, Math.min(slotWidth - 8, barWidth + 10));
    return [
      `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + markWidth).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#7c3aed" stroke-width="2" stroke-dasharray="5 4" />`,
      index === 0
        ? `<text x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" font-size="11" fill="#5b21b6">Monthly target</text>`
        : "",
    ].join("");
  }).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly comparison bar chart" class="report-chart">
      <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#f8fafc" />
      <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" stroke="#cbd5e1" />
      <text x="${padding.left}" y="18" font-size="11" fill="#64748b">Total collection by month</text>
      ${targetMarks}
      ${bars}
    </svg>
  `;
}

export function buildCollectionMonthlyComparisonPrintReportHtml(
  payload: CollectionMonthlyComparisonResponse,
  options: {
    monthlyTargetAmount?: number | null | undefined;
    monthlyTargetsByMonth?: CollectionMonthlyComparisonTargetLookup | undefined;
    monthlyTargetSourceLabel?: string | null | undefined;
    sameDayPace?: CollectionSameDayPaceComparison | null | undefined;
    generatedAt?: Date | undefined;
  } = {},
): string {
  const insights = buildCollectionMonthlyComparisonInsights(payload);
  const benchmarks = buildCollectionMonthlyComparisonBenchmarks(payload);
  const trendExplanation = buildCollectionMonthlyComparisonTrendExplanation(payload);
  const targetInput = options.monthlyTargetsByMonth ?? options.monthlyTargetAmount ?? null;
  const targetSummary = buildCollectionMonthlyComparisonTargetSummary(
    payload,
    targetInput,
  );
  const reportReferenceDate = options.generatedAt || new Date();
  const projection = buildCollectionMonthlyComparisonProjection(
    payload,
    targetInput,
    reportReferenceDate,
  );
  const dataQuality = buildCollectionMonthlyComparisonDataQualitySummary(
    payload,
    targetInput,
    reportReferenceDate,
  );
  const targetStatus = !targetSummary
    ? "No configured monthly target"
    : targetSummary.targetGap >= 0
      ? "At or above range target"
      : "Below range target";
  const anomalySummary = insights.anomalyMonthCount > 0
    ? `${insights.anomalyMonthCount} anomaly month(s) flagged`
    : "No anomaly above threshold";
  const generatedAt = formatCollectionMonthlyComparisonReportDate(reportReferenceDate);
  const chartSvg = buildCollectionMonthlyComparisonReportChartSvg(insights, targetInput);
  const monthRows = insights.monthInsights.map((month) => {
    const monthTarget = resolveCollectionMonthlyComparisonTargetForMonth(month.month, targetInput);
    const targetGap = monthTarget === null
      ? "N/A"
      : formatCollectionMonthlyComparisonDifference(month.totalCollection - monthTarget);
    return `
      <tr>
        <td>${escapeCollectionMonthlyComparisonHtml(month.label)}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(formatAmountRM(month.totalCollection))}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(month.recordCount)}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(formatAmountRM(month.averagePerRecord))}</td>
        <td>${escapeCollectionMonthlyComparisonHtml(formatCollectionMonthlyComparisonMonthDelta(month.deltaFromPrevious, month.percentageFromPrevious))}</td>
        <td>${escapeCollectionMonthlyComparisonHtml(month.anomalyLabel || "Clear")}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(targetGap)}</td>
      </tr>
    `;
  }).join("");
  const anomalyRows = insights.anomalyMonths.length > 0
    ? insights.anomalyMonths.map((month) => `
      <li><strong>${escapeCollectionMonthlyComparisonHtml(month.label)}</strong>: ${escapeCollectionMonthlyComparisonHtml(month.anomalyLabel || "Anomaly flagged")}</li>
    `).join("")
    : "<li>No month moved more than the configured anomaly threshold.</li>";
  const projectionSummary = projection
    ? `${projection.label} current total ${formatAmountRM(projection.currentTotal)} after ${projection.elapsedDays}/${projection.totalDays} day(s), projected ${formatAmountRM(projection.projectedTotal)}${projection.targetGap === null ? "." : ` with target gap ${formatCollectionMonthlyComparisonDifference(projection.targetGap)}.`}`
    : "Current month is outside the selected range, so no projection is shown.";
  const qualityRows = dataQuality.signals.map((signal) => `
      <li><strong>${escapeCollectionMonthlyComparisonHtml(signal.label)}</strong>: ${escapeCollectionMonthlyComparisonHtml(signal.description)}</li>
    `).join("");
  const sameDayPace = options.sameDayPace || null;
  const sameDayPaceRows = sameDayPace
    ? sameDayPace.insights.slice(0, 5).map((insight) => `
      <li>${escapeCollectionMonthlyComparisonHtml(insight)}</li>
    `).join("")
    : "<li>Same-day pace data was not available for this report.</li>";
  const benchmarkRows = benchmarks.map((benchmark) => `
      <tr>
        <td>${escapeCollectionMonthlyComparisonHtml(benchmark.label)}</td>
        <td>${escapeCollectionMonthlyComparisonHtml(benchmark.referenceLabel)}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(benchmark.referenceTotal === null ? "N/A" : formatAmountRM(benchmark.referenceTotal))}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(formatCollectionMonthlyComparisonDifference(benchmark.difference))}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(formatCollectionMonthlyComparisonPercentage(benchmark.percentageChange))}</td>
        <td>${escapeCollectionMonthlyComparisonHtml(benchmark.summary)}</td>
      </tr>
    `).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SQR Monthly Comparison Report</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, sans-serif; color: #0f172a; background: #ffffff; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; background: #eef2f7; }
    main { max-width: 980px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe3ef; border-radius: 18px; padding: 28px; box-shadow: 0 18px 60px rgba(15, 23, 42, 0.10); }
    header { display: flex; justify-content: space-between; gap: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 18px; }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; }
    h2 { margin: 26px 0 10px; font-size: 16px; }
    p { margin: 0; line-height: 1.55; }
    .muted { color: #64748b; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
    .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; background: #f8fafc; }
    .label { margin-bottom: 5px; color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; }
    .value { font-size: 17px; font-weight: 800; color: #0f172a; }
    .section { margin-top: 22px; }
    .report-chart { width: 100%; height: auto; display: block; margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 9px 8px; text-align: left; vertical-align: top; }
    th { color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: .02em; background: #f8fafc; }
    .numeric { text-align: right; white-space: nowrap; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    li { margin: 5px 0; }
    .actions { margin: 18px auto 0; max-width: 980px; text-align: right; }
    .print-button { border: 0; border-radius: 999px; background: #2563eb; color: white; font-weight: 700; padding: 10px 16px; cursor: pointer; }
    @media (max-width: 760px) {
      body { padding: 12px; }
      main { padding: 18px; }
      header { display: block; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      table { font-size: 11px; }
    }
    @media print {
      body { padding: 0; background: #ffffff; }
      main { max-width: none; border: 0; border-radius: 0; box-shadow: none; padding: 18mm 14mm; }
      .actions { display: none; }
      h2, table, .card, .report-chart { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Monthly Collection Comparison</h1>
        <p class="muted">${escapeCollectionMonthlyComparisonHtml(payload.nickname)} - ${escapeCollectionMonthlyComparisonHtml(payload.startMonth)} to ${escapeCollectionMonthlyComparisonHtml(payload.endMonth)}</p>
      </div>
      <div>
        <p class="muted">Generated</p>
        <p>${escapeCollectionMonthlyComparisonHtml(generatedAt)}</p>
      </div>
    </header>

    <section class="grid" aria-label="Report summary">
      <div class="card"><p class="label">Range total</p><p class="value">${escapeCollectionMonthlyComparisonHtml(formatAmountRM(insights.rangeTotal))}</p><p class="muted">${escapeCollectionMonthlyComparisonHtml(insights.totalRecords)} record(s)</p></div>
      <div class="card"><p class="label">Target status</p><p class="value">${escapeCollectionMonthlyComparisonHtml(targetStatus)}</p><p class="muted">${targetSummary ? escapeCollectionMonthlyComparisonHtml(`${(targetSummary.targetProgress * 100).toFixed(1)}% of ${formatAmountRM(targetSummary.rangeTarget)}`) : "No target line used"}</p></div>
      <div class="card"><p class="label">Best month</p><p class="value">${escapeCollectionMonthlyComparisonHtml(insights.peakMonth?.label || "No data")}</p><p class="muted">${escapeCollectionMonthlyComparisonHtml(insights.peakMonth ? formatAmountRM(insights.peakMonth.totalCollection) : "No collection recorded")}</p></div>
      <div class="card"><p class="label">Audit watch</p><p class="value">${escapeCollectionMonthlyComparisonHtml(anomalySummary)}</p><p class="muted">Threshold ${COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT}%</p></div>
    </section>

    <section class="section">
      <h2>Same-day pace</h2>
      ${sameDayPace ? `
      <div class="grid">
        <div class="card"><p class="label">Current same-day</p><p class="value">${escapeCollectionMonthlyComparisonHtml(formatAmountRM(sameDayPace.currentTotal))}</p><p class="muted">${escapeCollectionMonthlyComparisonHtml(sameDayPace.currentRangeLabel)}</p></div>
        <div class="card"><p class="label">Previous same-day</p><p class="value">${escapeCollectionMonthlyComparisonHtml(formatAmountRM(sameDayPace.previousTotal))}</p><p class="muted">${escapeCollectionMonthlyComparisonHtml(sameDayPace.previousRangeLabel)}</p></div>
        <div class="card"><p class="label">Same-day gap</p><p class="value">${escapeCollectionMonthlyComparisonHtml(formatCollectionMonthlyComparisonDifference(sameDayPace.difference))}</p><p class="muted">${escapeCollectionMonthlyComparisonHtml(sameDayPace.headline)}</p></div>
        <div class="card"><p class="label">Target pace</p><p class="value">${escapeCollectionMonthlyComparisonHtml(sameDayPace.target?.label || "No target")}</p><p class="muted">${escapeCollectionMonthlyComparisonHtml(sameDayPace.target ? formatCollectionMonthlyComparisonDifference(sameDayPace.target.paceGap) : "No configured target")}</p></div>
      </div>
      <p style="margin-top:10px">${escapeCollectionMonthlyComparisonHtml(sameDayPace.summary)}</p>` : `<p>Same-day pace appears when a valid comparison month range is available.</p>`}
      <ul>${sameDayPaceRows}</ul>
    </section>

    <section class="section">
      <h2>Trend explanation</h2>
      <p>${escapeCollectionMonthlyComparisonHtml(trendExplanation)}</p>
      <p class="muted">${escapeCollectionMonthlyComparisonHtml(payload.comparison.summary)}</p>
    </section>

    <section class="section">
      <h2>Benchmark lens</h2>
      <table>
        <thead>
          <tr>
            <th>Benchmark</th>
            <th>Reference</th>
            <th class="numeric">Reference total</th>
            <th class="numeric">Difference</th>
            <th class="numeric">Change</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>${benchmarkRows}</tbody>
      </table>
    </section>

    <section class="section">
      <h2>Chart</h2>
      ${chartSvg}
      <p class="muted">Target source: ${escapeCollectionMonthlyComparisonHtml(options.monthlyTargetSourceLabel || "No configured target source")}</p>
    </section>

    <section class="section">
      <h2>Current month projection</h2>
      <p>${escapeCollectionMonthlyComparisonHtml(projectionSummary)}</p>
      ${projection?.requiredDailyAverageToTarget !== null && projection?.requiredDailyAverageToTarget !== undefined ? `<p class="muted">Required daily average for remaining days: ${escapeCollectionMonthlyComparisonHtml(formatAmountRM(projection.requiredDailyAverageToTarget))}</p>` : ""}
    </section>

    <section class="section">
      <h2>Target and anomaly notes</h2>
      <p>${targetSummary ? escapeCollectionMonthlyComparisonHtml(`Target month target ${formatAmountRM(targetSummary.monthlyTargetAmount)}. Configured range target ${formatAmountRM(targetSummary.rangeTarget)} across ${targetSummary.configuredMonthCount} month(s). Gap ${formatCollectionMonthlyComparisonDifference(targetSummary.targetGap)}.`) : "No configured monthly target was available for this report."}</p>
      <ul>${anomalyRows}</ul>
    </section>

    <section class="section">
      <h2>Data quality checks</h2>
      <p>${escapeCollectionMonthlyComparisonHtml(dataQuality.statusLabel)}</p>
      <ul>${qualityRows}</ul>
    </section>

    <section class="section">
      <h2>Monthly breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th class="numeric">Total</th>
            <th class="numeric">Records</th>
            <th class="numeric">Avg / record</th>
            <th>Vs previous</th>
            <th>Audit</th>
            <th class="numeric">Target gap</th>
          </tr>
        </thead>
        <tbody>${monthRows}</tbody>
      </table>
    </section>
  </main>
  <div class="actions"><button class="print-button" type="button" onclick="window.print()">Print or save PDF</button></div>
  <script>window.addEventListener("load",function(){setTimeout(function(){window.print();},150);});</script>
</body>
</html>`;
}