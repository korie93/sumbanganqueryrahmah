import {
  useCallback,
  useMemo,
  useReducer,
  useRef,
  type MutableRefObject,
} from "react"

export interface AutoLogoutLifecycleState {
  readonly mounted: boolean
  readonly reconnectEnabled: boolean
  readonly logoutStarted: boolean
  readonly reconnectAttempt: number
  readonly activityListenersAttached: boolean
  readonly lastHeartbeatSyncAt: number
}

export type AutoLogoutLifecycleAction =
  | { readonly type: "SESSION_STARTED" }
  | { readonly type: "COMPONENT_UNMOUNTED" }
  | { readonly type: "LOGOUT_STARTED" }
  | { readonly type: "RECONNECT_ENABLED_SET"; readonly value: boolean }
  | { readonly type: "RECONNECT_ATTEMPT_SET"; readonly value: number }
  | { readonly type: "ACTIVITY_LISTENERS_ATTACHED_SET"; readonly value: boolean }
  | { readonly type: "HEARTBEAT_SYNCED"; readonly atMs: number }

export const initialAutoLogoutLifecycleState: AutoLogoutLifecycleState = {
  mounted: true,
  reconnectEnabled: true,
  logoutStarted: false,
  reconnectAttempt: 0,
  activityListenersAttached: false,
  lastHeartbeatSyncAt: 0,
}

export function autoLogoutLifecycleReducer(
  state: AutoLogoutLifecycleState,
  action: AutoLogoutLifecycleAction,
): AutoLogoutLifecycleState {
  switch (action.type) {
    case "SESSION_STARTED":
      return {
        ...state,
        mounted: true,
        reconnectEnabled: true,
        logoutStarted: false,
        reconnectAttempt: 0,
        lastHeartbeatSyncAt: 0,
      }

    case "COMPONENT_UNMOUNTED":
      return {
        ...state,
        mounted: false,
        reconnectEnabled: false,
        reconnectAttempt: 0,
      }

    case "LOGOUT_STARTED":
      if (state.logoutStarted && !state.reconnectEnabled && state.reconnectAttempt === 0) {
        return state
      }

      return {
        ...state,
        logoutStarted: true,
        reconnectEnabled: false,
        reconnectAttempt: 0,
      }

    case "RECONNECT_ENABLED_SET":
      if (state.reconnectEnabled === action.value) {
        return state
      }

      return {
        ...state,
        reconnectEnabled: action.value,
      }

    case "RECONNECT_ATTEMPT_SET":
      if (state.reconnectAttempt === action.value) {
        return state
      }

      return {
        ...state,
        reconnectAttempt: Math.max(0, action.value),
      }

    case "ACTIVITY_LISTENERS_ATTACHED_SET":
      if (state.activityListenersAttached === action.value) {
        return state
      }

      return {
        ...state,
        activityListenersAttached: action.value,
      }

    case "HEARTBEAT_SYNCED":
      if (state.lastHeartbeatSyncAt === action.atMs) {
        return state
      }

      return {
        ...state,
        lastHeartbeatSyncAt: Math.max(0, action.atMs),
      }

    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }
}

type LifecycleRefOptions = {
  readonly notifyReact?: boolean
}

type LifecycleDispatch = (
  action: AutoLogoutLifecycleAction,
  options?: LifecycleRefOptions,
) => void

function createLifecycleRef<T>(
  read: () => T,
  write: (value: T) => void,
): MutableRefObject<T> {
  return {
    get current() {
      return read()
    },
    set current(value: T) {
      write(value)
    },
  }
}

export function useAutoLogoutLifecycleController() {
  const lifecycleStateRef = useRef<AutoLogoutLifecycleState>(
    initialAutoLogoutLifecycleState,
  )
  const shouldNotifyReactRef = useRef(true)
  const [, dispatchReducer] = useReducer(
    autoLogoutLifecycleReducer,
    initialAutoLogoutLifecycleState,
  )

  const dispatchLifecycle = useCallback<LifecycleDispatch>((action, options) => {
    lifecycleStateRef.current = autoLogoutLifecycleReducer(
      lifecycleStateRef.current,
      action,
    )

    if (options?.notifyReact === false || !shouldNotifyReactRef.current) {
      return
    }

    dispatchReducer(action)
  }, [])

  const mountedRef = useMemo(
    () =>
      createLifecycleRef(
        () => lifecycleStateRef.current.mounted,
        (value) => {
          dispatchLifecycle({
            type: value ? "SESSION_STARTED" : "COMPONENT_UNMOUNTED",
          }, {
            notifyReact: value,
          })
        },
      ),
    [dispatchLifecycle],
  )

  const reconnectEnabledRef = useMemo(
    () =>
      createLifecycleRef(
        () => lifecycleStateRef.current.reconnectEnabled,
        (value) => {
          dispatchLifecycle({
            type: "RECONNECT_ENABLED_SET",
            value,
          })
        },
      ),
    [dispatchLifecycle],
  )

  const logoutStartedRef = useMemo(
    () =>
      createLifecycleRef(
        () => lifecycleStateRef.current.logoutStarted,
        (value) => {
          if (value) {
            dispatchLifecycle({ type: "LOGOUT_STARTED" })
            return
          }

          dispatchLifecycle({ type: "SESSION_STARTED" })
        },
      ),
    [dispatchLifecycle],
  )

  const reconnectAttemptRef = useMemo(
    () =>
      createLifecycleRef(
        () => lifecycleStateRef.current.reconnectAttempt,
        (value) => {
          dispatchLifecycle({
            type: "RECONNECT_ATTEMPT_SET",
            value,
          })
        },
      ),
    [dispatchLifecycle],
  )

  const activityListenersAttachedRef = useMemo(
    () =>
      createLifecycleRef(
        () => lifecycleStateRef.current.activityListenersAttached,
        (value) => {
          dispatchLifecycle({
            type: "ACTIVITY_LISTENERS_ATTACHED_SET",
            value,
          })
        },
      ),
    [dispatchLifecycle],
  )

  const lastHeartbeatSyncAtRef = useMemo(
    () =>
      createLifecycleRef(
        () => lifecycleStateRef.current.lastHeartbeatSyncAt,
        (value) => {
          dispatchLifecycle({
            type: "HEARTBEAT_SYNCED",
            atMs: value,
          })
        },
      ),
    [dispatchLifecycle],
  )

  const startSessionLifecycle = useCallback(() => {
    shouldNotifyReactRef.current = true
    dispatchLifecycle({ type: "SESSION_STARTED" })
  }, [dispatchLifecycle])

  const markUnmountedLifecycle = useCallback(() => {
    shouldNotifyReactRef.current = false
    dispatchLifecycle(
      { type: "COMPONENT_UNMOUNTED" },
      { notifyReact: false },
    )
  }, [dispatchLifecycle])

  const markLogoutStarted = useCallback(() => {
    dispatchLifecycle({ type: "LOGOUT_STARTED" })
  }, [dispatchLifecycle])

  return {
    activityListenersAttachedRef,
    lastHeartbeatSyncAtRef,
    logoutStartedRef,
    markLogoutStarted,
    markUnmountedLifecycle,
    mountedRef,
    reconnectAttemptRef,
    reconnectEnabledRef,
    startSessionLifecycle,
  } as const
}
