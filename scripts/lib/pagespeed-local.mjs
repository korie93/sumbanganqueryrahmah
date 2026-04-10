export function getLighthouseRuntimeErrorCode(report) {
  const code = report?.runtimeError?.code;
  return typeof code === "string" && code.length > 0 ? code : null;
}

export function isRetryableLighthouseRuntimeError(report) {
  return getLighthouseRuntimeErrorCode(report) === "NO_NAVSTART";
}

export function isUsableLighthouseReport(report) {
  return getLighthouseRuntimeErrorCode(report) === null;
}

function normalizeMetricDisplayValue(value) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function formatMetricDisplayValue(audit) {
  if (!audit || typeof audit !== "object") {
    return "n/a";
  }

  if (typeof audit.displayValue === "string" && audit.displayValue.trim().length > 0) {
    return normalizeMetricDisplayValue(audit.displayValue);
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

function isMobileUserAgent(userAgent) {
  return /android|iphone|ipad|ipod|mobile/i.test(userAgent);
}

function shouldIncludeObservedMetric(entry, expectedProfile, targetPath, sinceMs) {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  if (entry.httpPath !== "/telemetry/web-vitals" || entry.path !== targetPath) {
    return false;
  }

  if (entry.navigationType !== "navigate") {
    return false;
  }

  if (!["FCP", "LCP", "CLS", "TTFB"].includes(entry.metric)) {
    return false;
  }

  const capturedAtMs = Date.parse(String(entry.capturedAt || entry.time || ""));
  if (Number.isFinite(sinceMs) && Number.isFinite(capturedAtMs) && capturedAtMs < sinceMs) {
    return false;
  }

  const userAgent = String(entry.userAgent || "");
  const actualProfile = isMobileUserAgent(userAgent) ? "mobile" : "desktop";
  if (actualProfile === expectedProfile) {
    return true;
  }

  if (
    expectedProfile === "mobile"
    && actualProfile === "desktop"
    && ["LCP", "CLS"].includes(entry.metric)
    && /HeadlessChrome/i.test(userAgent)
  ) {
    return true;
  }

  return false;
}

function formatObservedMetric(metricName, value) {
  if (metricName === "CLS") {
    return Number.isInteger(value) ? `${value}` : value.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/u, "")} s`;
  }

  return `${Math.round(value)} ms`;
}

export function summarizeObservedWebVitalsFromLog(logText, options = {}) {
  if (typeof logText !== "string" || logText.trim().length === 0) {
    return null;
  }

  const targetPath = String(options.path || "").trim();
  if (!targetPath) {
    return null;
  }

  const expectedProfile = options.preset === "desktop" ? "desktop" : "mobile";
  const sinceMs = options.since ? Date.parse(String(options.since)) : Number.NaN;
  const latestMetrics = new Map();

  for (const rawLine of logText.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line.startsWith("{")) {
      continue;
    }

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (!shouldIncludeObservedMetric(entry, expectedProfile, targetPath, sinceMs)) {
      continue;
    }

    const metricName = String(entry.metric);
    const value = Number(entry.value);
    if (!Number.isFinite(value)) {
      continue;
    }

    const capturedAt = String(entry.capturedAt || entry.time || "");
    const previous = latestMetrics.get(metricName);
    if (!previous || Date.parse(capturedAt) >= Date.parse(previous.capturedAt)) {
      latestMetrics.set(metricName, {
        value,
        rating: typeof entry.rating === "string" ? entry.rating : null,
        capturedAt,
      });
    }
  }

  if (latestMetrics.size === 0) {
    return null;
  }

  const fcp = latestMetrics.get("FCP");
  const lcp = latestMetrics.get("LCP");
  const ttfb = latestMetrics.get("TTFB");
  const cls = latestMetrics.get("CLS");
  const allCapturedAt = [...latestMetrics.values()].map((metric) => metric.capturedAt).filter(Boolean);
  const capturedAt = allCapturedAt.sort().at(-1) || null;

  return {
    source: "server-telemetry",
    userAgentProfile: expectedProfile,
    capturedAt,
    fcp: fcp ? formatObservedMetric("FCP", fcp.value) : "n/a",
    lcp: lcp ? formatObservedMetric("LCP", lcp.value) : "n/a",
    ttfb: ttfb ? formatObservedMetric("TTFB", ttfb.value) : "n/a",
    cls: cls ? formatObservedMetric("CLS", cls.value) : "n/a",
    ratings: {
      ...(fcp ? { fcp: fcp.rating } : {}),
      ...(lcp ? { lcp: lcp.rating } : {}),
      ...(ttfb ? { ttfb: ttfb.rating } : {}),
      ...(cls ? { cls: cls.rating } : {}),
    },
  };
}
