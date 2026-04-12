import type { ChartConfig } from "./chart-shared"
import { CHART_THEMES } from "./chart-shared"

export function sanitizeChartToken(value: string) {
  const normalized = String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "-")
  return normalized || "chart"
}

export function sanitizeChartColorValue(value: string) {
  const normalized = String(value || "").trim()
  if (!normalized) {
    return null
  }

  const lowerNormalized = normalized.toLowerCase()
  if (
    lowerNormalized.includes("url(") ||
    lowerNormalized.includes("expression(")
  ) {
    return null
  }

  return /^[#(),.%/:\-\s\w]+$/.test(normalized) ? normalized : null
}

export function buildChartStyleMarkup(id: string, config: ChartConfig) {
  const colorConfig = Object.entries(config).filter(
    ([, itemConfig]) => itemConfig.theme || itemConfig.color
  )

  if (!colorConfig.length) {
    return null
  }

  const safeChartId = sanitizeChartToken(id)

  const markup = Object.entries(CHART_THEMES)
    .map(
      ([theme, prefix]) => `\n${prefix} [data-chart="${safeChartId}"] {\n${colorConfig
        .map(([key, itemConfig]) => {
          const color =
            itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
            itemConfig.color
          const safeColor = color ? sanitizeChartColorValue(color) : null
          return safeColor ? `  --color-${key}: ${safeColor};` : null
        })
        .filter((line): line is string => Boolean(line))
        .join("\n")}\n}\n`
    )
    .join("\n")

  return markup || null
}

export function resolveChartPresentationColor(value: string | undefined) {
  return sanitizeChartColorValue(value || "") || "currentColor"
}
