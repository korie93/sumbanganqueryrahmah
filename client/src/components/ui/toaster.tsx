import {
  TOAST_OCCURRENCE_DISPLAY_LIMIT,
  useToastState,
} from "@/hooks/use-toast"
import { ExpandableMessage } from "@/components/ExpandableMessage"
import { ToastRequestReference } from "@/components/ui/ToastRequestReference"
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

function ToastOccurrenceCount({ count }: { count: number }) {
  if (count <= 1) {
    return null
  }

  const countLabel = count > TOAST_OCCURRENCE_DISPLAY_LIMIT
    ? `${TOAST_OCCURRENCE_DISPLAY_LIMIT}+ kali`
    : `${count} kali`

  return (
    <span
      className="shrink-0 rounded-md border border-current/20 bg-black/5 px-1.5 py-0.5 text-xs font-semibold dark:bg-white/10"
      aria-label={`Notifikasi ini berlaku ${countLabel}`}
      title={`Notifikasi ini berlaku ${countLabel}`}
    >
      {countLabel}
    </span>
  )
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
        occurrenceCount,
        title,
        description,
        action,
        dedupeKey: _dedupeKey,
        historyAction: _historyAction,
        loading,
        priority: _priority,
        requestId,
        ...props
      }) {
        return (
          <Toast key={`${id}:${revision}`} {...props}>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start gap-3">
                <ToastStatusIcon loading={loading} variant={props.variant} />
                <div className="grid min-w-0 flex-1 gap-1">
                  {title && (
                    <div className="flex min-w-0 items-start gap-2">
                      <ToastTitle className="min-w-0 flex-1">{title}</ToastTitle>
                      <ToastOccurrenceCount count={occurrenceCount} />
                    </div>
                  )}
                  {description && (
                    <ToastDescription>
                      <ExpandableMessage>{description}</ExpandableMessage>
                    </ToastDescription>
                  )}
                </div>
              </div>
              {requestId && <ToastRequestReference requestId={requestId} />}
              {action && <div className="mt-3 flex justify-end">{action}</div>}
            </div>
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
