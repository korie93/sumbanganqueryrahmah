import { cn } from "@/lib/utils"

import { resolveChartPresentationColor } from "./chart-style-utils"

export function ChartIndicator({
  color,
  indicator,
  nestLabel = false,
}: {
  color?: string | undefined
  indicator: "line" | "dot" | "dashed"
  nestLabel?: boolean
}) {
  const presentationColor = resolveChartPresentationColor(color)

  if (indicator === "dot") {
    return (
      <span aria-hidden className="h-2.5 w-2.5 shrink-0">
        <svg className="h-full w-full overflow-visible" viewBox="0 0 10 10">
          <rect
            x="0.75"
            y="0.75"
            width="8.5"
            height="8.5"
            rx="2"
            fill={presentationColor}
            stroke={presentationColor}
          />
        </svg>
      </span>
    )
  }

  return (
    <span
      aria-hidden
      className={cn(
        "shrink-0 self-stretch",
        indicator === "line" ? "w-1" : "w-[3px]",
        nestLabel && indicator === "dashed" && "my-0.5"
      )}
    >
      <svg
        className="h-full w-full overflow-visible"
        viewBox="0 0 4 32"
        preserveAspectRatio="none"
      >
        <line
          x1="2"
          y1="1"
          x2="2"
          y2="31"
          stroke={presentationColor}
          strokeWidth={indicator === "line" ? "4" : "3"}
          strokeDasharray={indicator === "dashed" ? "5 4" : undefined}
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

export function ChartLegendSwatch({
  color,
}: {
  color?: string | undefined
}) {
  const presentationColor = resolveChartPresentationColor(color)

  return (
    <span aria-hidden className="h-2 w-2 shrink-0">
      <svg className="h-full w-full overflow-visible" viewBox="0 0 8 8">
        <rect
          x="0.75"
          y="0.75"
          width="6.5"
          height="6.5"
          rx="1.5"
          fill={presentationColor}
          stroke={presentationColor}
        />
      </svg>
    </span>
  )
}
