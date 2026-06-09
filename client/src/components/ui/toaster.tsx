import { useToastState } from "@/hooks/use-toast"
import { ExpandableMessage } from "@/components/ExpandableMessage"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import {
  CircleAlert,
  CircleCheck,
  Info,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react"

function ToastStatusIcon({
  loading,
  variant,
}: {
  loading: boolean | undefined
  variant: "default" | "destructive" | "info" | "success" | "warning" | null | undefined
}) {
  if (loading) {
    return <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
  }
  if (variant === "success") {
    return <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
  }
  if (variant === "warning") {
    return <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
  }
  if (variant === "destructive") {
    return <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
  }
  return <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
}

/**
 * Renders the shared toaster component used across SQR screens.
 */
export function Toaster() {
  const { toasts } = useToastState()

  return (
    <ToastProvider>
      {toasts.map(function ({
        id,
        revision,
        title,
        description,
        action,
        dedupeKey: _dedupeKey,
        loading,
        priority: _priority,
        ...props
      }) {
        return (
          <Toast key={`${id}:${revision}`} {...props}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <ToastStatusIcon loading={loading} variant={props.variant} />
              <div className="grid min-w-0 flex-1 gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>
                    <ExpandableMessage>{description}</ExpandableMessage>
                  </ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
