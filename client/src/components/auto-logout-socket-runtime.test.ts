import assert from "node:assert/strict"
import test from "node:test"

import {
  bindAutoLogoutSocket,
  disposeAutoLogoutSocket,
} from "@/components/auto-logout-socket-runtime"

test("disposeAutoLogoutSocket detaches handlers, closes active sockets, and clears the ref", () => {
  let closeCalls = 0
  const socket = {
    readyState: WebSocket.OPEN,
    onopen() {},
    onmessage() {},
    onclose() {},
    onerror() {},
    close() {
      closeCalls += 1
    },
  }
  const wsRef = {
    current: socket as unknown as WebSocket | null,
  }

  const disposed = disposeAutoLogoutSocket(socket, wsRef)

  assert.equal(disposed, true)
  assert.equal(closeCalls, 1)
  assert.equal(wsRef.current, null)
  assert.equal(socket.onopen, null)
  assert.equal(socket.onmessage, null)
  assert.equal(socket.onclose, null)
  assert.equal(socket.onerror, null)
})

test("disposeAutoLogoutSocket stays safe for sockets that are already closed", () => {
  let closeCalls = 0
  const socket = {
    readyState: WebSocket.CLOSED,
    onopen() {},
    onmessage() {},
    onclose() {},
    onerror() {},
    close() {
      closeCalls += 1
    },
  }

  const disposed = disposeAutoLogoutSocket(socket)

  assert.equal(disposed, true)
  assert.equal(closeCalls, 0)
  assert.equal(socket.onopen, null)
  assert.equal(socket.onmessage, null)
  assert.equal(socket.onclose, null)
  assert.equal(socket.onerror, null)
})

test("bindAutoLogoutSocket reports reconnect attempts and clears feedback after the socket opens again", () => {
  const originalWindow = globalThis.window
  const originalWebSocket = globalThis.WebSocket
  const originalLocalStorage = globalThis.localStorage

  const scheduledTimers = new Map<number, () => void>()
  const createdSockets: FakeWebSocket[] = []
  let nextTimerId = 1

  class FakeWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 3

    readyState = FakeWebSocket.CONNECTING
    onopen: ((this: WebSocket, event: Event) => unknown) | null = null
    onmessage: ((this: WebSocket, event: MessageEvent) => unknown) | null = null
    onclose: ((this: WebSocket, event: CloseEvent) => unknown) | null = null
    onerror: ((this: WebSocket, event: Event) => unknown) | null = null

    constructor(readonly url: string) {
      createdSockets.push(this)
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED
    }
  }

  const windowMock = {
    location: {
      protocol: "https:",
      host: "example.test",
      href: "https://example.test/dashboard",
    },
    setTimeout(callback: () => void) {
      const timerId = nextTimerId
      nextTimerId += 1
      scheduledTimers.set(timerId, callback)
      return timerId
    },
    clearTimeout(timerId: number) {
      scheduledTimers.delete(timerId)
    },
    dispatchEvent() {
      return true
    },
  } as unknown as Window & typeof globalThis

  const localStorageMock = {
    get length() {
      return 0
    },
    getItem() {
      return null
    },
    setItem() {},
    removeItem() {},
    clear() {},
    key() {
      return null
    },
  } as unknown as Storage

  Object.assign(globalThis, {
    window: windowMock,
    WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    localStorage: localStorageMock,
  })

  try {
    const reconnectStates: Array<{
      visible: boolean
      attempt: number
      retryDelayMs: number | null
    }> = []
    const mountedRef = { current: true }
    const reconnectEnabledRef = { current: true }
    const reconnectAttemptRef = { current: 0 }
    const socketGenerationRef = { current: 0 }
    const wsRef = { current: null as WebSocket | null }
    const reconnectRef = { current: null as number | null }
    const clearReconnect = () => {
      if (reconnectRef.current !== null) {
        windowMock.clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
    }
    const cleanupSocket = () => {
      clearReconnect()
      disposeAutoLogoutSocket(wsRef.current, wsRef)
    }

    const cleanup = bindAutoLogoutSocket({
      username: "operator.one",
      mountedRef,
      reconnectEnabledRef,
      reconnectAttemptRef,
      socketGenerationRef,
      wsRef,
      reconnectRef,
      clearReconnect,
      cleanupSocket,
      runClientLogout: async () => undefined,
      onReconnectStateChange: (state) => {
        reconnectStates.push(state)
      },
    })

    assert.equal(createdSockets.length, 1)
    assert.deepEqual(reconnectStates[0], {
      visible: false,
      attempt: 0,
      retryDelayMs: null,
    })

    const firstSocket = createdSockets[0]
    firstSocket.readyState = FakeWebSocket.CLOSED
    firstSocket.onclose?.call(firstSocket as unknown as WebSocket, {} as CloseEvent)

    const reconnectState = reconnectStates[reconnectStates.length - 1]
    assert.equal(reconnectState?.visible, true)
    assert.equal(reconnectState?.attempt, 1)
    assert.equal(typeof reconnectState?.retryDelayMs, "number")
    assert.ok((reconnectState?.retryDelayMs ?? 0) > 0)
    assert.ok(reconnectRef.current !== null)

    const scheduledReconnect = scheduledTimers.get(reconnectRef.current!)
    assert.ok(scheduledReconnect)
    scheduledReconnect?.()

    assert.equal(createdSockets.length, 2)
    assert.equal(reconnectAttemptRef.current, 1)

    const secondSocket = createdSockets[1]
    secondSocket.readyState = FakeWebSocket.OPEN
    secondSocket.onopen?.call(secondSocket as unknown as WebSocket, {} as Event)

    assert.deepEqual(reconnectStates[reconnectStates.length - 1], {
      visible: false,
      attempt: 0,
      retryDelayMs: null,
    })
    assert.equal(reconnectAttemptRef.current, 0)

    cleanup?.()
  } finally {
    Object.assign(globalThis, {
      window: originalWindow,
      WebSocket: originalWebSocket,
      localStorage: originalLocalStorage,
    })
  }
})

test("bindAutoLogoutSocket ignores stale reconnect timers after a newer lifecycle takes over", () => {
  const originalWindow = globalThis.window
  const originalWebSocket = globalThis.WebSocket
  const originalLocalStorage = globalThis.localStorage

  const scheduledTimers = new Map<number, () => void>()
  const createdSockets: FakeWebSocket[] = []
  let nextTimerId = 1

  class FakeWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 3

    readyState = FakeWebSocket.CONNECTING
    onopen: ((this: WebSocket, event: Event) => unknown) | null = null
    onmessage: ((this: WebSocket, event: MessageEvent) => unknown) | null = null
    onclose: ((this: WebSocket, event: CloseEvent) => unknown) | null = null
    onerror: ((this: WebSocket, event: Event) => unknown) | null = null

    constructor(readonly url: string) {
      createdSockets.push(this)
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED
    }
  }

  const windowMock = {
    location: {
      protocol: "https:",
      host: "example.test",
      href: "https://example.test/dashboard",
    },
    setTimeout(callback: () => void) {
      const timerId = nextTimerId
      nextTimerId += 1
      scheduledTimers.set(timerId, callback)
      return timerId
    },
    clearTimeout(timerId: number) {
      scheduledTimers.delete(timerId)
    },
    dispatchEvent() {
      return true
    },
  } as unknown as Window & typeof globalThis

  const localStorageMock = {
    get length() {
      return 0
    },
    getItem() {
      return null
    },
    setItem() {},
    removeItem() {},
    clear() {},
    key() {
      return null
    },
  } as unknown as Storage

  Object.assign(globalThis, {
    window: windowMock,
    WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    localStorage: localStorageMock,
  })

  try {
    const mountedRef = { current: true }
    const reconnectEnabledRef = { current: true }
    const reconnectAttemptRef = { current: 0 }
    const socketGenerationRef = { current: 0 }
    const wsRef = { current: null as WebSocket | null }
    const reconnectRef = { current: null as number | null }
    const clearReconnect = () => {
      if (reconnectRef.current !== null) {
        windowMock.clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
    }
    const cleanupSocket = () => {
      clearReconnect()
      disposeAutoLogoutSocket(wsRef.current, wsRef)
    }

    const firstCleanup = bindAutoLogoutSocket({
      username: "operator.one",
      mountedRef,
      reconnectEnabledRef,
      reconnectAttemptRef,
      socketGenerationRef,
      wsRef,
      reconnectRef,
      clearReconnect,
      cleanupSocket,
      runClientLogout: async () => undefined,
    })

    assert.equal(createdSockets.length, 1)

    const firstSocket = createdSockets[0]
    firstSocket.readyState = FakeWebSocket.CLOSED
    firstSocket.onclose?.call(firstSocket as unknown as WebSocket, {} as CloseEvent)
    const staleReconnectId = reconnectRef.current
    assert.notEqual(staleReconnectId, null)

    firstCleanup?.()

    const secondCleanup = bindAutoLogoutSocket({
      username: "operator.one",
      mountedRef,
      reconnectEnabledRef,
      reconnectAttemptRef,
      socketGenerationRef,
      wsRef,
      reconnectRef,
      clearReconnect,
      cleanupSocket,
      runClientLogout: async () => undefined,
    })

    assert.equal(createdSockets.length, 2)

    scheduledTimers.get(staleReconnectId!)?.()

    assert.equal(createdSockets.length, 2)

    secondCleanup?.()
  } finally {
    Object.assign(globalThis, {
      window: originalWindow,
      WebSocket: originalWebSocket,
      localStorage: originalLocalStorage,
    })
  }
})
