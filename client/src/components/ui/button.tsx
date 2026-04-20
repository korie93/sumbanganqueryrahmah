import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { shouldWarnForMissingAccessibilityName } from "@/components/ui/accessibility-warning-mode"
import { cn } from "@/lib/utils"
import { FOCUS_VISIBLE_RING_CLASS_NAME } from "@/components/ui/focus-ring"

function setButtonRef(
  ref: React.ForwardedRef<HTMLButtonElement>,
  value: HTMLButtonElement | null,
) {
  if (typeof ref === "function") {
    ref(value)
    return
  }

  if (ref) {
    ref.current = value
  }
}

const buttonVariants = cva(
  `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ${FOCUS_VISIBLE_RING_CLASS_NAME} disabled:pointer-events-none disabled:opacity-50 max-sm:min-w-11 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0` +
  " hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary-border",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive-border",
        outline:
          // Shows the background color of whatever card / sidebar / accent background it is inside of.
          // Inherits the current text color.
          " border [border-color:var(--button-outline)]  shadow-xs active:shadow-none ",
        secondary: "border bg-secondary text-secondary-foreground border border-secondary-border ",
        // Add a transparent border so that when someone toggles a border on later, it doesn't shift layout/size.
        ghost: "border border-transparent",
        link: "border border-transparent px-0 text-primary underline-offset-4 hover:underline",
      },
      // Heights are set as "min" heights, because sometimes Ai will place large amount of content
      // inside buttons. With a min-height they will look appropriate with small amounts of content,
      // but will expand to fit large amounts of content.
      size: {
        default: "min-h-11 px-4 py-2 sm:min-h-9",
        sm: "min-h-11 rounded-md px-3 text-xs sm:min-h-8",
        lg: "min-h-11 rounded-md px-8 sm:min-h-10",
        icon: "h-11 w-11 sm:h-9 sm:w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      title,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button"
    const buttonRef = React.useRef<HTMLButtonElement | null>(null)
    const combinedRef = React.useCallback((node: HTMLButtonElement | null) => {
      if (!asChild) {
        buttonRef.current = node
      }
      setButtonRef(ref, node)
    }, [asChild, ref])
    const resolvedAriaLabel =
      ariaLabel ?? (size === "icon" && typeof title === "string" ? title : undefined)
    const ariaLabelProps = resolvedAriaLabel ? { "aria-label": resolvedAriaLabel } : {}

    React.useEffect(() => {
      if (!shouldWarnForMissingAccessibilityName() || asChild || size !== "icon") {
        return
      }

      const button = buttonRef.current
      if (!button) {
        return
      }

      const hasTextContent = Boolean(button.textContent?.trim())
      if (resolvedAriaLabel || ariaLabelledBy || hasTextContent) {
        return
      }

      console.warn("Icon button rendered without an accessible name. Add a title, aria-label, or visually hidden text.", {
        type: props.type || "button",
        variant: variant || "default",
      })
    }, [ariaLabelledBy, asChild, props.type, resolvedAriaLabel, size, variant])

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={combinedRef}
        title={title}
        {...ariaLabelProps}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
