export function getLighthouseRuntimeErrorCode(report) {
  const code = report?.runtimeError?.code;
  return typeof code === "string" && code.length > 0 ? code : null;
}

export function isRetryableLighthouseRuntimeError(report) {
  return getLighthouseRuntimeErrorCode(report) === "NO_NAVSTART";
}

function formatMetricDisplayValue(audit) {
  if (!audit || typeof audit !== "object") {
    return "n/a";
  }

  if (typeof audit.displayValue === "string" && audit.displayValue.trim().length > 0) {
    return audit.displayValue.trim();
  }

  if (typeof audit.numericValue === "number") {
    return `${audit.numericValue}`;
  }

  return "n/a";
}

export function summarizeLighthouseReport(report) {
  const performanceScore = report?.categories?.performance?.score;
  const accessibilityScore = report?.categories?.accessibility?.score;
  const bestPracticesScore = report?.categories?.["best-practices"]?.score;
  const seoScore = report?.categories?.seo?.score;

  const scoreToPercent = (score) =>
    typeof score === "number" && Number.isFinite(score) ? Math.round(score * 100) : null;

  return {
    runtimeErrorCode: getLighthouseRuntimeErrorCode(report),
    performance: scoreToPercent(performanceScore),
    accessibility: scoreToPercent(accessibilityScore),
    bestPractices: scoreToPercent(bestPracticesScore),
    seo: scoreToPercent(seoScore),
    fcp: formatMetricDisplayValue(report?.audits?.["first-contentful-paint"]),
    lcp: formatMetricDisplayValue(report?.audits?.["largest-contentful-paint"]),
    tbt: formatMetricDisplayValue(report?.audits?.["total-blocking-time"]),
    cls: formatMetricDisplayValue(report?.audits?.["cumulative-layout-shift"]),
  };
}
