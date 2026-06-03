"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const PROGRESS_INDICATOR_TRANSFORM_VAR = "--sqr-progress-indicator-transform"
const useClientLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

function normalizeProgressValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0
  }

  return Math.min(100, Math.max(0, value))
}

/**
 * Renders the shared progress component used across SQR screens.
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => {
  const indicatorRef = React.useRef<HTMLDivElement | null>(null)
  const normalizedValue = normalizeProgressValue(value)
  const indicatorTransform = `translateX(-${100 - normalizedValue}%)`

  useClientLayoutEffect(() => {
    indicatorRef.current?.style.setProperty(PROGRESS_INDICATOR_TRANSFORM_VAR, indicatorTransform)
  }, [indicatorTransform])

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        ref={indicatorRef}
        className="h-full w-full flex-1 bg-primary transition-all [transform:var(--sqr-progress-indicator-transform,translateX(-100%))]"
      />
    </ProgressPrimitive.Root>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
