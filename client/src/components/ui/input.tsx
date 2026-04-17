import * as React from "react"

import { cn } from "@/lib/utils"
import { FOCUS_VISIBLE_RING_CLASS_NAME } from "@/components/ui/focus-ring"

function setInputRef(
  ref: React.ForwardedRef<HTMLInputElement>,
  value: HTMLInputElement | null,
) {
  if (typeof ref === "function") {
    ref(value)
    return
  }

  if (ref) {
    ref.current = value
  }
}

function shouldWarnForMissingAccessibleName() {
  return typeof window !== "undefined"
    && (import.meta.env?.DEV ?? process.env.NODE_ENV !== "production")
}

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const generatedId = React.useId()
    const fallbackId = !props.id && !props.name ? generatedId : undefined
    const inputRef = React.useRef<HTMLInputElement | null>(null)
    const combinedRef = React.useCallback((node: HTMLInputElement | null) => {
      inputRef.current = node
      setInputRef(ref, node)
    }, [ref])

    React.useEffect(() => {
      if (!shouldWarnForMissingAccessibleName()) {
        return
      }

      const input = inputRef.current
      if (!input || input.type === "hidden") {
        return
      }

      const ariaLabel = String(props["aria-label"] ?? "").trim()
      const ariaLabelledBy = String(props["aria-labelledby"] ?? "").trim()
      const hasAssociatedLabel = Number(input.labels?.length ?? 0) > 0

      if (ariaLabel || ariaLabelledBy || hasAssociatedLabel) {
        return
      }

      console.warn("Input rendered without an accessible name. Add a visible label or aria-label/aria-labelledby.", {
        id: input.id || undefined,
        name: props.name || undefined,
        type: input.type || type || "text",
      })
    }, [props["aria-label"], props["aria-labelledby"], props.name, type])

    // h-9 to match icon buttons and default buttons.
    return (
      <input
        type={type}
        id={props.id ?? fallbackId}
        className={cn(
          `flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground ${FOCUS_VISIBLE_RING_CLASS_NAME} disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:min-h-9 md:text-sm`,
          className
        )}
        ref={combinedRef}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
