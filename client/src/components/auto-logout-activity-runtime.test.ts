import assert from "node:assert/strict"
import test from "node:test"

import {
  bindAutoLogoutActivityListeners,
  bindAutoLogoutVisibilityChange,
} from "@/components/auto-logout-activity-runtime"

type Listener = () => void

function createFakeDocument() {
  const listeners = new Map<string, Set<Listener>>()

  return {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener(eventName: string, listener: Listener) {
      const eventListeners = listeners.get(eventName) ?? new Set<Listener>()
      eventListeners.add(listener)
      listeners.set(eventName, eventListeners)
    },
    removeEventListener(eventName: string, listener: Listener) {
      listeners.get(eventName)?.delete(listener)
    },
    emit(eventName: string) {
      listeners.get(eventName)?.forEach((listener) => {
        listener()
      })
    },
  }
}

test("bindAutoLogoutActivityListeners binds listeners, starts heartbeat interval, and cleans up safely", async () => {
  const fakeDocument = createFakeDocument()
  const clearIntervalCalls: number[] = []
  const globalScope = globalThis as typeof globalThis & {
    document?: Document
    window?: Window & typeof globalThis
  }
  const previousDocument = globalScope.document
  const previousWindow = globalScope.window

  globalScope.document = fakeDocument as unknown as Document
  globalScope.window = {
    setInterval: () => 321,
    clearInterval: (timerId: number) => {
      clearIntervalCalls.push(timerId)
    },
  } as unknown as Window & typeof globalThis

  const heartbeatRef = { current: null as number | null }
  const activityListenersAttachedRef = { current: false }
  const lastResetByEventRef = { current: 0 }
  let resetCalls = 0
  let heartbeatCalls = 0
  let syncCalls = 0
  let clearIdleTimeoutCalls = 0
  let clearHeartbeatCalls = 0
  let clearHeartbeatRequestCalls = 0

  try {
    const cleanup = bindAutoLogoutActivityListeners({
      heartbeatMs: 5_000,
      heartbeatRef,
      activityListenersAttachedRef,
      lastResetByEventRef,
      resetTimeout: () => {
        resetCalls += 1
      },
      sendHeartbeat: async () => {
        heartbeatCalls += 1
      },
      syncHeartbeatIfNeeded: () => {
        syncCalls += 1
      },
      clearIdleTimeout: () => {
        clearIdleTimeoutCalls += 1
      },
      clearHeartbeat: () => {
        clearHeartbeatCalls += 1
        if (heartbeatRef.current !== null) {
          clearIntervalCalls.push(heartbeatRef.current)
          heartbeatRef.current = null
        }
      },
      clearHeartbeatRequest: () => {
        clearHeartbeatRequestCalls += 1
      },
    })

    assert.equal(activityListenersAttachedRef.current, true)
    assert.equal(heartbeatRef.current, 321)
    assert.equal(resetCalls, 1)
    await Promise.resolve()
    assert.equal(heartbeatCalls, 1)

    fakeDocument.emit("mousedown")
    assert.equal(resetCalls, 2)
    assert.equal(syncCalls, 1)

    cleanup?.()

    assert.equal(activityListenersAttachedRef.current, false)
    assert.deepEqual(clearIntervalCalls, [321])
    assert.equal(clearIdleTimeoutCalls, 1)
    assert.equal(clearHeartbeatCalls, 1)
    assert.equal(clearHeartbeatRequestCalls, 1)
  } finally {
    globalScope.document = previousDocument
    globalScope.window = previousWindow
  }
})

test("bindAutoLogoutVisibilityChange logs out only after idle timeout and otherwise refreshes activity state", () => {
  const fakeDocument = createFakeDocument()
  const globalScope = globalThis as typeof globalThis & { document?: Document }
  const previousDocument = globalScope.document
  globalScope.document = fakeDocument as unknown as Document

  const lastActivityRef = { current: Date.now() }
  let logoutCalls = 0
  let resetCalls = 0
  let syncCalls = 0

  try {
    const cleanup = bindAutoLogoutVisibilityChange({
      timeoutMs: 10_000,
      lastActivityRef,
      runLogout: async () => {
        logoutCalls += 1
      },
      resetTimeout: () => {
        resetCalls += 1
      },
      syncHeartbeatIfNeeded: () => {
        syncCalls += 1
      },
    })

    fakeDocument.emit("visibilitychange")
    assert.equal(logoutCalls, 0)
    assert.equal(resetCalls, 1)
    assert.equal(syncCalls, 1)

    lastActivityRef.current = Date.now() - 10_001
    fakeDocument.emit("visibilitychange")
    assert.equal(logoutCalls, 1)
    assert.equal(resetCalls, 1)
    assert.equal(syncCalls, 1)

    cleanup()
  } finally {
    globalScope.document = previousDocument
  }
})

test("bindAutoLogoutActivityListeners detaches events so later activity does not re-arm timers", async () => {
  const fakeDocument = createFakeDocument()
  const globalScope = globalThis as typeof globalThis & {
    document?: Document
    window?: Window & typeof globalThis
  }
  const previousDocument = globalScope.document
  const previousWindow = globalScope.window

  globalScope.document = fakeDocument as unknown as Document
  globalScope.window = {
    setInterval: () => 654,
    clearInterval: () => undefined,
  } as unknown as Window & typeof globalThis

  const heartbeatRef = { current: null as number | null }
  const activityListenersAttachedRef = { current: false }
  const lastResetByEventRef = { current: 0 }
  let resetCalls = 0
  let syncCalls = 0
  let heartbeatCalls = 0

  try {
    const cleanup = bindAutoLogoutActivityListeners({
      heartbeatMs: 5_000,
      heartbeatRef,
      activityListenersAttachedRef,
      lastResetByEventRef,
      resetTimeout: () => {
        resetCalls += 1
      },
      sendHeartbeat: async () => {
        heartbeatCalls += 1
      },
      syncHeartbeatIfNeeded: () => {
        syncCalls += 1
      },
      clearIdleTimeout: () => undefined,
      clearHeartbeat: () => {
        heartbeatRef.current = null
      },
      clearHeartbeatRequest: () => undefined,
    })

    await Promise.resolve()
    assert.equal(heartbeatCalls, 1)
    cleanup?.()

    fakeDocument.emit("mousedown")
    assert.equal(resetCalls, 1)
    assert.equal(syncCalls, 0)
    assert.equal(activityListenersAttachedRef.current, false)
  } finally {
    globalScope.document = previousDocument
    globalScope.window = previousWindow
  }
})
