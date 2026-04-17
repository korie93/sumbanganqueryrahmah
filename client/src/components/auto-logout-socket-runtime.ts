import type { MutableRefObject } from "react"

import { getBrowserLocalStorage, safeSetStorageItem } from "@/lib/browser-storage"
import { getStoredUsername, setBannedSessionFlag } from "@/lib/auth-session"
import {
  parseAutoLogoutWebSocketMessage,
  resolveAutoLogoutReconnectDelayMs,
  resolveAutoLogoutSocketCloseOutcome,
} from "@/components/auto-logout-websocket"
import {
  notifyAutoLogoutNotice,
  warnAutoLogoutDiagnostic,
} from "@/components/auto-logout-diagnostics"
import {
  AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE,
  createAutoLogoutReconnectFeedbackState,
  createAutoLogoutReconnectTerminalState,
  type AutoLogoutReconnectFeedbackState,
} from "@/components/auto-logout-reconnect-feedback"

export type AutoLogoutSocketLike = Pick<WebSocket, "close" | "readyState"> & {
  onopen: ((this: WebSocket, event: Event) => unknown) | null
  onmessage: ((this: WebSocket, event: MessageEvent) => unknown) | null
  onclose: ((this: WebSocket, event: CloseEvent) => unknown) | null
  onerror: ((this: WebSocket, event: Event) => unknown) | null
}

type BindAutoLogoutSocketArgs = {
  username: string | undefined
  mountedRef: MutableRefObject<boolean>
  reconnectEnabledRef: MutableRefObject<boolean>
  reconnectAttemptRef: MutableRefObject<number>
  socketGenerationRef: MutableRefObject<number>
  wsRef: MutableRefObject<WebSocket | null>
  reconnectRef: MutableRefObject<number | null>
  clearReconnect: () => void
  cleanupSocket: () => void
  runClientLogout: () => Promise<void>
  onReconnectStateChange?: (state: AutoLogoutReconnectFeedbackState) => void
}

export function disposeAutoLogoutSocket(
  socket: AutoLogoutSocketLike | null | undefined,
  wsRef?: MutableRefObject<WebSocket | null>,
) {
  if (!socket) {
    return false
  }

  if (wsRef?.current === socket) {
    wsRef.current = null
  }

  socket.onopen = null
  socket.onmessage = null
  socket.onclose = null
  socket.onerror = null

  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    try {
      socket.close()
    } catch {
      return false
    }
  }

  return true
}

export function bindAutoLogoutSocket({
  username,
  mountedRef,
  reconnectEnabledRef,
  reconnectAttemptRef,
  socketGenerationRef,
  wsRef,
  reconnectRef,
  clearReconnect,
  cleanupSocket,
  runClientLogout,
  onReconnectStateChange,
}: BindAutoLogoutSocketArgs) {
  const currentUsername = username || getStoredUsername()
  if (!currentUsername) {
    return undefined
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const host = window.location.host
  const storage = getBrowserLocalStorage()
  reconnectEnabledRef.current = true
  reconnectAttemptRef.current = 0
  let disposed = false
  const lifecycleGeneration = socketGenerationRef.current + 1
  socketGenerationRef.current = lifecycleGeneration

  const isActiveLifecycle = () =>
    !disposed
    && mountedRef.current
    && reconnectEnabledRef.current
    && socketGenerationRef.current === lifecycleGeneration

  const notifyReconnectStateChange = (state: AutoLogoutReconnectFeedbackState) => {
    if (!isActiveLifecycle()) {
      return
    }

    onReconnectStateChange?.(state)
  }

  notifyReconnectStateChange(AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE)

  const isCurrentSocket = (socket: WebSocket) =>
    isActiveLifecycle() && wsRef.current === socket

  const disposeSocketInstance = (socket: WebSocket | null | undefined) => {
    disposeAutoLogoutSocket(socket, wsRef)
  }

  const stopReconnect = (terminalMessage?: string) => {
    clearReconnect()
    if (
      !disposed
      && mountedRef.current
      && socketGenerationRef.current === lifecycleGeneration
      && typeof onReconnectStateChange === "function"
    ) {
      onReconnectStateChange(
        terminalMessage
          ? createAutoLogoutReconnectTerminalState(terminalMessage)
          : AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE,
      )
    }

    reconnectEnabledRef.current = false
    reconnectAttemptRef.current = 0
  }

  const scheduleReconnect = () => {
    const nextUsername = username || getStoredUsername()
    if (!isActiveLifecycle() || !nextUsername) {
      return
    }

    const closeOutcome = resolveAutoLogoutSocketCloseOutcome(null, reconnectAttemptRef.current)
    if (!closeOutcome.retry) {
      stopReconnect(closeOutcome.terminalMessage)
      return
    }

    clearReconnect()
    const attempt = reconnectAttemptRef.current
    const delayMs = resolveAutoLogoutReconnectDelayMs(attempt)
    notifyReconnectStateChange(createAutoLogoutReconnectFeedbackState(attempt, delayMs))
    reconnectRef.current = window.setTimeout(() => {
      reconnectRef.current = null
      if (!isActiveLifecycle()) {
        return
      }
      reconnectAttemptRef.current = attempt + 1
      connectWebSocket()
    }, delayMs)
  }

  const connectWebSocket = () => {
    if (!isActiveLifecycle()) return
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    let socket: WebSocket | null = null

    try {
      const wsUrl = `${protocol}//${host}/ws`
      socket = new WebSocket(wsUrl)
      const activeSocket = socket
      wsRef.current = activeSocket

      activeSocket.onopen = () => {
        if (isCurrentSocket(activeSocket)) {
          reconnectAttemptRef.current = 0
          notifyReconnectStateChange(AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE)
        }
      }

      activeSocket.onmessage = (event) => {
        if (!isCurrentSocket(activeSocket)) {
          return
        }

        const message = parseAutoLogoutWebSocketMessage(event.data)
        if (!message) {
          warnAutoLogoutDiagnostic("Failed to parse WebSocket message:", event.data)
          return
        }

        if (message.type === "kicked") {
          notifyAutoLogoutNotice(message.reason, "Anda telah dilogout oleh pentadbir.")
          void runClientLogout()
        }

        if (message.type === "logout") {
          notifyAutoLogoutNotice(message.reason, "Sesi anda telah ditamatkan.")
          void runClientLogout()
        }

        if (message.type === "banned") {
          setBannedSessionFlag(true)
          notifyAutoLogoutNotice(message.reason, "Akaun anda telah disekat.")
          window.location.href = "/"
        }

        if (message.type === "maintenance_update") {
          const payload = {
            maintenance: message.maintenance,
            message: message.message,
            type: message.mode,
            startTime: message.startTime,
            endTime: message.endTime,
          }
          safeSetStorageItem(storage, "maintenanceState", JSON.stringify(payload))
          window.dispatchEvent(new CustomEvent("maintenance-updated", { detail: payload }))
          if (payload.maintenance) {
            window.location.href = "/maintenance"
          }
        }

        if (message.type === "settings_updated") {
          window.dispatchEvent(new CustomEvent("settings-updated", { detail: message }))
        }
      }

      activeSocket.onclose = (event) => {
        if (!isCurrentSocket(activeSocket)) {
          if (wsRef.current === activeSocket) {
            wsRef.current = null
          }
          return
        }

        wsRef.current = null
        const closeOutcome = resolveAutoLogoutSocketCloseOutcome(event, reconnectAttemptRef.current)
        if (!closeOutcome.retry) {
          stopReconnect(closeOutcome.terminalMessage)
          if (closeOutcome.shouldLogout) {
            notifyAutoLogoutNotice(undefined, closeOutcome.terminalMessage)
            void runClientLogout()
          }
          return
        }
        scheduleReconnect()
      }

      activeSocket.onerror = (error) => {
        if (!isCurrentSocket(activeSocket)) {
          return
        }
        warnAutoLogoutDiagnostic("WebSocket error:", error)
      }
    } catch (error) {
      disposeSocketInstance(socket)
      warnAutoLogoutDiagnostic("Failed to connect WebSocket:", error)
      scheduleReconnect()
    }
  }

  connectWebSocket()

  return () => {
    disposed = true
    reconnectEnabledRef.current = false
    reconnectAttemptRef.current = 0
    if (socketGenerationRef.current === lifecycleGeneration) {
      socketGenerationRef.current += 1
    }
    cleanupSocket()
  }
}
