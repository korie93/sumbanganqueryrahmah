import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"
import { recordNotificationHistory } from "@/hooks/use-notification-history"

const TOAST_LIMIT = 2
export const TOAST_TIMEOUT_LIMIT = TOAST_LIMIT
export const TOAST_REMOVE_DELAY_MS = 5000
export const TOAST_LISTENER_LIMIT = 50
export const TOAST_OCCURRENCE_DISPLAY_LIMIT = 99
const TOAST_OCCURRENCE_SENTINEL = TOAST_OCCURRENCE_DISPLAY_LIMIT + 1

type ToastPriority = "normal" | "critical"

type ToasterToast = ToastProps & {
  id: string
  revision: number
  occurrenceCount: number
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
  dedupeKey?: string
  loading?: boolean
  priority?: ToastPriority
  requestId?: string
}

type ToastTransientKey = "action" | "loading" | "priority" | "requestId"

type ActionType = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
}

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
      clearFields?: readonly ToastTransientKey[]
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"] | undefined
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"] | undefined
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const clearToastTimeout = (toastId: string) => {
  const timeout = toastTimeouts.get(toastId)
  if (!timeout) {
    return
  }
  clearTimeout(timeout)
  toastTimeouts.delete(toastId)
}

const pruneToastTimeoutsForToastIds = (activeToastIds: ReadonlySet<string>) => {
  for (const toastId of Array.from(toastTimeouts.keys())) {
    if (!activeToastIds.has(toastId)) {
      clearToastTimeout(toastId)
    }
  }

  while (toastTimeouts.size > TOAST_TIMEOUT_LIMIT) {
    const oldestToastId = toastTimeouts.keys().next().value
    if (!oldestToastId) {
      return
    }
    clearToastTimeout(oldestToastId)
  }
}

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  pruneToastTimeoutsForToastIds(new Set(memoryState.toasts.map((toast) => toast.id)))

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY_MS)

  toastTimeouts.set(toastId, timeout)
  pruneToastTimeoutsForToastIds(new Set(memoryState.toasts.map((toast) => toast.id)))
}

function resolveToastPriority(toast: Pick<ToasterToast, "priority" | "variant">): ToastPriority {
  if (toast.priority) {
    return toast.priority
  }
  return toast.variant === "destructive" ? "critical" : "normal"
}

function isRepeatableToastVariant(variant: ToasterToast["variant"]): boolean {
  return variant === "destructive" || variant === "warning"
}

function resolveDedupeOccurrenceCount(
  existingToast: ToasterToast,
  incomingToast: ToastInput,
): number {
  if (
    !isRepeatableToastVariant(incomingToast.variant)
    || existingToast.variant !== incomingToast.variant
  ) {
    return 1
  }

  return Math.min(existingToast.occurrenceCount + 1, TOAST_OCCURRENCE_SENTINEL)
}

function selectBoundedToasts(toasts: ToasterToast[]): ToasterToast[] {
  const criticalToast = toasts.find((item) => resolveToastPriority(item) === "critical")
  const normalToast = toasts.find((item) => resolveToastPriority(item) === "normal")
  const selectedIds = new Set(
    [criticalToast?.id, normalToast?.id].filter((id): id is string => Boolean(id)),
  )
  return toasts.filter((item) => selectedIds.has(item.id)).slice(0, TOAST_LIMIT)
}

function clearTransientToastFields(
  toast: ToasterToast,
  clearFields: readonly ToastTransientKey[],
): ToasterToast {
  let nextToast = toast

  if (clearFields.includes("action")) {
    const { action: _action, ...rest } = nextToast
    nextToast = rest
  }
  if (clearFields.includes("loading")) {
    const { loading: _loading, ...rest } = nextToast
    nextToast = rest
  }
  if (clearFields.includes("priority")) {
    const { priority: _priority, ...rest } = nextToast
    nextToast = rest
  }
  if (clearFields.includes("requestId")) {
    const { requestId: _requestId, ...rest } = nextToast
    nextToast = rest
  }

  return nextToast
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: selectBoundedToasts([
          action.toast,
          ...state.toasts.filter((item) => item.id !== action.toast.id),
        ]),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: selectBoundedToasts(
          state.toasts.map((t) =>
            t.id === action.toast.id
              ? clearTransientToastFields(
                  {
                    ...t,
                    ...action.toast,
                    revision: t.revision + 1,
                  },
                  action.clearFields ?? [],
                )
              : t,
          ),
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        for (const toastId of toastTimeouts.keys()) {
          clearToastTimeout(toastId)
        }
        return {
          ...state,
          toasts: [],
        }
      }
      clearToastTimeout(action.toastId)
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners = new Set<(state: State) => void>()

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  pruneToastTimeoutsForToastIds(new Set(memoryState.toasts.map((toast) => toast.id)))
  Array.from(listeners).forEach((listener) => {
    listener(memoryState)
  })
}

export function getToastTimeoutCountForTests() {
  return toastTimeouts.size
}

export function getToastListenerCountForTests() {
  return listeners.size
}

export function getToastStateForTests() {
  return memoryState
}

export function resetToastStateForTests() {
  for (const toastId of Array.from(toastTimeouts.keys())) {
    clearToastTimeout(toastId)
  }
  memoryState = { toasts: [] }
  Array.from(listeners).forEach((listener) => {
    listener(memoryState)
  })
}

export function subscribeToastState(listener: (state: State) => void) {
  listeners.add(listener)

  while (listeners.size > TOAST_LISTENER_LIMIT) {
    const oldestListener = listeners.values().next().value
    if (!oldestListener) {
      break
    }
    listeners.delete(oldestListener)
  }

  return () => {
    listeners.delete(listener)
  }
}

export type ToastInput = Omit<ToasterToast, "id" | "revision" | "occurrenceCount">
type ToastUpdate = Omit<Partial<ToastInput>, ToastTransientKey> & {
  action?: ToastActionElement | undefined
  loading?: boolean | undefined
  priority?: ToastPriority | undefined
  requestId?: string | undefined
}

export type ToastHandle = {
  id: string
  dismiss: () => void
  update: (props: ToastUpdate) => void
}

function applyToastUpdate(
  id: string,
  props: ToastUpdate,
  occurrenceCount = 1,
): void {
  clearToastTimeout(id)
  const clearFields = (["action", "loading", "priority", "requestId"] as const)
    .filter((field) => field in props && props[field] === undefined)
  const {
    action,
    loading,
    priority,
    requestId,
    ...persistentProps
  } = props
  dispatch({
    type: "UPDATE_TOAST",
    toast: {
      ...persistentProps,
      ...(action !== undefined ? { action } : {}),
      ...(loading !== undefined ? { loading } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
      id,
      occurrenceCount,
      open: true,
    },
    clearFields,
  })
  const updatedToast = memoryState.toasts.find((toast) => toast.id === id)
  if (updatedToast) {
    recordNotificationHistory(updatedToast)
  }
}

function buildToastHandle(id: string): ToastHandle {
  const update = (props: ToastUpdate) => {
    applyToastUpdate(id, props)
  }
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  return {
    id,
    dismiss,
    update,
  }
}

export type ToastFunction = (props: ToastInput) => ToastHandle

function toast({ ...props }: ToastInput): ToastHandle {
  const dedupeKey = String(props.dedupeKey || "").trim()
  const existingToast = dedupeKey
    ? memoryState.toasts.find((item) => item.dedupeKey === dedupeKey)
    : undefined

  if (existingToast) {
    const handle = buildToastHandle(existingToast.id)
    applyToastUpdate(
      existingToast.id,
      {
        action: undefined,
        loading: false,
        priority: undefined,
        requestId: undefined,
        ...props,
        dedupeKey,
      },
      resolveDedupeOccurrenceCount(existingToast, props),
    )
    return handle
  }

  const id = genId()
  const handle = buildToastHandle(id)

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      revision: 0,
      occurrenceCount: 1,
      ...(dedupeKey ? { dedupeKey } : {}),
      open: true,
      onOpenChange: (open) => {
        if (!open) handle.dismiss()
      },
    },
  })
  const addedToast = memoryState.toasts.find((toast) => toast.id === id)
  if (addedToast) {
    recordNotificationHistory(addedToast)
  }

  return handle
}

function useToastState() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    return subscribeToastState(setState)
  }, [])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

const toastActions = {
  toast,
  dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
}

function useToast() {
  return toastActions
}

export { useToast, useToastState, toast }
