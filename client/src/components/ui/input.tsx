import * as React from "react"

import { cn } from "@/lib/utils"
import { FOCUS_VISIBLE_RING_CLASS_NAME } from "@/components/ui/focus-ring"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const generatedId = React.useId()
    const fallbackId = !props.id && !props.name ? generatedId : undefined

    // h-9 to match icon buttons and default buttons.
    return (
      <input
        type={type}
        id={props.id ?? fallbackId}
        className={cn(
          `flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground ${FOCUS_VISIBLE_RING_CLASS_NAME} disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:min-h-9 md:text-sm`,
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
