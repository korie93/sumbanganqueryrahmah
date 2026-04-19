import type { MutableRefObject } from "react"

import { activityHeartbeatLight } from "@/lib/api"

import { warnAutoLogoutDiagnostic } from "@/components/auto-logout-diagnostics"

type SendAutoLogoutHeartbeatArgs = {
  heartbeatAbortControllerRef: MutableRefObject<AbortController | null>
  lastHeartbeatSyncAtRef: MutableRefObject<number>
  mountedRef: MutableRefObject<boolean>
  logoutStartedRef: MutableRefObject<boolean>
}

export async function sendAutoLogoutHeartbeat({
  heartbeatAbortControllerRef,
  lastHeartbeatSyncAtRef,
  mountedRef,
  logoutStartedRef,
}: SendAutoLogoutHeartbeatArgs) {
  if (logoutStartedRef.current) return
  if (heartbeatAbortControllerRef.current) return

  const controller = new AbortController()
  heartbeatAbortControllerRef.current = controller

  try {
    await activityHeartbeatLight({
      signal: controller.signal,
    })
    if (
      controller.signal.aborted
      || !mountedRef.current
      || logoutStartedRef.current
    ) {
      return
    }
    lastHeartbeatSyncAtRef.current = Date.now()
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("activity-heartbeat-synced"))
    }
  } catch (error) {
    if (
      controller.signal.aborted ||
      !mountedRef.current ||
      logoutStartedRef.current
    ) {
      return
    }
    warnAutoLogoutDiagnostic("Heartbeat failed:", error)
  } finally {
    if (heartbeatAbortControllerRef.current === controller) {
      heartbeatAbortControllerRef.current = null
    }
  }
}
