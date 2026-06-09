import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

const TOAST_LIMIT = 2
export const TOAST_TIMEOUT_LIMIT = TOAST_LIMIT
export const TOAST_REMOVE_DELAY_MS = 5000
export const TOAST_LISTENER_LIMIT = 50

type ToastPriority = "normal" | "critical"

type ToasterToast = ToastProps & {
  id: string
  revision: number
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
  dedupeKey?: string
  loading?: boolean
  priority?: ToastPriority
}

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

function selectBoundedToasts(toasts: ToasterToast[]): ToasterToast[] {
  const criticalToast = toasts.find((item) => resolveToastPriority(item) === "critical")
  const normalToast = toasts.find((item) => resolveToastPriority(item) === "normal")
  const selectedIds = new Set(
    [criticalToast?.id, normalToast?.id].filter((id): id is string => Boolean(id)),
  )
  return toasts.filter((item) => selectedIds.has(item.id)).slice(0, TOAST_LIMIT)
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
              ? {
                  ...t,
                  ...action.toast,
                  revision: t.revision + 1,
                }
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

export type ToastInput = Omit<ToasterToast, "id" | "revision">
type ToastUpdate = Partial<ToastInput>

export type ToastHandle = {
  id: string
  dismiss: () => void
  update: (props: ToastUpdate) => void
}

function buildToastHandle(id: string): ToastHandle {
  const update = (props: ToastUpdate) => {
    clearToastTimeout(id)
    dispatch({
      type: "UPDATE_TOAST",
      toast: {
        ...props,
        id,
        open: true,
      },
    })
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
    handle.update({
      ...props,
      dedupeKey,
    })
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
      ...(dedupeKey ? { dedupeKey } : {}),
      open: true,
      onOpenChange: (open) => {
        if (!open) handle.dismiss()
      },
    },
  })

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
