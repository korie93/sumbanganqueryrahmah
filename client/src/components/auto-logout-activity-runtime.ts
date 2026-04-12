import type { MutableRefObject } from "react"

export const AUTO_LOGOUT_ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "touchstart",
  "click",
] as const

type BindAutoLogoutActivityListenersArgs = {
  heartbeatMs: number
  heartbeatRef: MutableRefObject<number | null>
  activityListenersAttachedRef: MutableRefObject<boolean>
  lastResetByEventRef: MutableRefObject<number>
  resetTimeout: () => void
  sendHeartbeat: () => Promise<void>
  syncHeartbeatIfNeeded: (nowMs: number) => void
  clearIdleTimeout: () => void
  clearHeartbeat: () => void
  clearHeartbeatRequest: () => void
}

export function bindAutoLogoutActivityListeners({
  heartbeatMs,
  heartbeatRef,
  activityListenersAttachedRef,
  lastResetByEventRef,
  resetTimeout,
  sendHeartbeat,
  syncHeartbeatIfNeeded,
  clearIdleTimeout,
  clearHeartbeat,
  clearHeartbeatRequest,
}: BindAutoLogoutActivityListenersArgs) {
  if (activityListenersAttachedRef.current) {
    return undefined
  }

  activityListenersAttachedRef.current = true

  const handleActivity = () => {
    const now = Date.now()
    if (now - lastResetByEventRef.current < 1000) return
    lastResetByEventRef.current = now
    resetTimeout()
    syncHeartbeatIfNeeded(now)
  }

  AUTO_LOGOUT_ACTIVITY_EVENTS.forEach((eventName) => {
    document.addEventListener(eventName, handleActivity, { passive: true })
  })

  resetTimeout()
  void sendHeartbeat()
  heartbeatRef.current = window.setInterval(() => {
    void sendHeartbeat()
  }, heartbeatMs)

  return () => {
    activityListenersAttachedRef.current = false
    AUTO_LOGOUT_ACTIVITY_EVENTS.forEach((eventName) => {
      document.removeEventListener(eventName, handleActivity)
    })
    clearIdleTimeout()
    clearHeartbeat()
    clearHeartbeatRequest()
  }
}

type BindAutoLogoutVisibilityChangeArgs = {
  timeoutMs: number
  lastActivityRef: MutableRefObject<number>
  runLogout: () => Promise<void>
  resetTimeout: () => void
  syncHeartbeatIfNeeded: () => void
}

export function bindAutoLogoutVisibilityChange({
  timeoutMs,
  lastActivityRef,
  runLogout,
  resetTimeout,
  syncHeartbeatIfNeeded,
}: BindAutoLogoutVisibilityChangeArgs) {
  const handleVisibilityChange = () => {
    if (document.visibilityState !== "visible") return

    const idleTime = Date.now() - lastActivityRef.current
    if (idleTime >= timeoutMs) {
      void runLogout()
      return
    }

    resetTimeout()
    syncHeartbeatIfNeeded()
  }

  document.addEventListener("visibilitychange", handleVisibilityChange)
  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange)
  }
}
