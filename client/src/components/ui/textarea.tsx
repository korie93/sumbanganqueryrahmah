import * as React from "react"

import { cn } from "@/lib/utils"
import { FOCUS_VISIBLE_RING_CLASS_NAME } from "@/components/ui/focus-ring"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  const generatedId = React.useId()
  const fallbackId = !props.id && !props.name ? generatedId : undefined

  return (
    <textarea
      id={props.id ?? fallbackId}
      className={cn(
        `flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground ${FOCUS_VISIBLE_RING_CLASS_NAME} disabled:cursor-not-allowed disabled:opacity-50 md:text-sm`,
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
