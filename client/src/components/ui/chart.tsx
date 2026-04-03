"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { toTrustedHTML } from "@/lib/trusted-types"
import { cn } from "@/lib/utils"

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function sanitizeChartToken(value: string) {
  const normalized = String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "-")
  return normalized || "chart"
}

function sanitizeChartColorValue(value: string) {
  const normalized = String(value || "").trim()
  if (!normalized) {
    return null
  }

  return /^[#(),.%/:\-\s\w]+$/.test(normalized) ? normalized : null
}

function buildChartStyleMarkup(id: string, config: ChartConfig) {
  const colorConfig = Object.entries(config).filter(
    ([, itemConfig]) => itemConfig.theme || itemConfig.color
  )

  if (!colorConfig.length) {
    return null
  }

  const safeChartId = sanitizeChartToken(id)

  const markup = Object.entries(THEMES)
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

function resolveChartPresentationColor(value: string | undefined) {
  return sanitizeChartColorValue(value || "") || "currentColor"
}

function ChartIndicator({
  color,
  indicator,
  nestLabel = false,
}: {
  color?: string
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

function ChartLegendSwatch({ color }: { color?: string }) {
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

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig
    children: React.ComponentProps<
      typeof RechartsPrimitive.ResponsiveContainer
    >["children"]
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = sanitizeChartToken(`chart-${id || uniqueId.replace(/:/g, "")}`)

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = "Chart"

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const styleMarkup = buildChartStyleMarkup(id, config)

  if (!styleMarkup) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: toTrustedHTML(styleMarkup),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean
      hideIndicator?: boolean
      indicator?: "line" | "dot" | "dashed"
      nameKey?: string
      labelKey?: string
    }
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref
  ) => {
    const { config } = useChart()

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        return null
      }

      const [item] = payload
      const key = `${labelKey || item?.dataKey || item?.name || "value"}`
      const itemConfig = getPayloadConfigFromPayload(config, item, key)
      const value =
        !labelKey && typeof label === "string"
          ? config[label as keyof typeof config]?.label || label
          : itemConfig?.label

      if (labelFormatter) {
        return (
          <div className={cn("font-medium", labelClassName)}>
            {labelFormatter(value, payload)}
          </div>
        )
      }

      if (!value) {
        return null
      }

      return <div className={cn("font-medium", labelClassName)}>{value}</div>
    }, [
      label,
      labelFormatter,
      payload,
      hideLabel,
      labelClassName,
      config,
      labelKey,
    ])

    if (!active || !payload?.length) {
      return null
    }

    const nestLabel = payload.length === 1 && indicator !== "dot"

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
          className
        )}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const key = `${nameKey || item.name || item.dataKey || "value"}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = color || item.payload.fill || item.color

            return (
              <div
                key={item.dataKey}
                className={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  indicator === "dot" && "items-center"
                )}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <ChartIndicator
                          color={indicatorColor}
                          indicator={indicator}
                          nestLabel={nestLabel}
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center"
                      )}
                    >
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">
                          {itemConfig?.label || item.name}
                        </span>
                      </div>
                      {item.value && (
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {item.value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
ChartTooltipContent.displayName = "ChartTooltip"

const ChartLegend = RechartsPrimitive.Legend

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> &
    Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & {
      hideIcon?: boolean
      nameKey?: string
    }
>(
  (
    { className, hideIcon = false, payload, verticalAlign = "bottom", nameKey },
    ref
  ) => {
    const { config } = useChart()

    if (!payload?.length) {
      return null
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-center gap-4",
          verticalAlign === "top" ? "pb-3" : "pt-3",
          className
        )}
      >
        {payload.map((item) => {
          const key = `${nameKey || item.dataKey || "value"}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)

          return (
            <div
              key={item.value}
              className={cn(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
              )}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <ChartLegendSwatch color={item.color} />
              )}
              {itemConfig?.label}
            </div>
          )
        })}
      </div>
    )
  }
)
ChartLegendContent.displayName = "ChartLegend"

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey: string = key

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === "string"
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key as keyof typeof config]
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}
