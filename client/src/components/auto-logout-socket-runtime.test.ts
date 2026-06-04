import assert from "node:assert/strict"
import test from "node:test"

import {
  bindAutoLogoutSocket,
  disposeAutoLogoutSocket,
} from "@/components/auto-logout-socket-runtime"
import {
  isBannedSessionFlagSet,
  setBannedSessionFlag,
} from "@/lib/auth-session"

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

test("disposeAutoLogoutSocket clears stale refs when cleanup runs without a socket", () => {
  const wsRef = {
    current: { readyState: WebSocket.CLOSED } as WebSocket | null,
  }

  const disposed = disposeAutoLogoutSocket(null, wsRef)

  assert.equal(disposed, false)
  assert.equal(wsRef.current, null)
})

test("banned websocket messages run client cleanup and preserve the banned flag", async () => {
  const originalWindow = globalThis.window
  const originalSessionStorage = globalThis.sessionStorage
  const originalWebSocket = globalThis.WebSocket
  const sessionStore = new Map<string, string>()
  const sockets: TestWebSocket[] = []
  let logoutCalls = 0
  let closeCalls = 0

  class TestWebSocket {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSED = 3

    readyState = TestWebSocket.OPEN
    onopen: ((this: WebSocket, event: Event) => unknown) | null = null
    onmessage: ((this: WebSocket, event: MessageEvent) => unknown) | null = null
    onclose: ((this: WebSocket, event: CloseEvent) => unknown) | null = null
    onerror: ((this: WebSocket, event: Event) => unknown) | null = null

    constructor(readonly url: string) {
      sockets.push(this)
    }

    close() {
      closeCalls += 1
      this.readyState = TestWebSocket.CLOSED
    }
  }

  const fakeStorage = {
    getItem(key: string) {
      return sessionStore.get(key) ?? null
    },
    setItem(key: string, value: string) {
      sessionStore.set(key, value)
    },
    removeItem(key: string) {
      sessionStore.delete(key)
    },
  }

  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: fakeStorage,
  })
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    value: TestWebSocket,
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      clearTimeout,
      dispatchEvent() {},
      location: {
        href: "http://127.0.0.1:5000/app",
        host: "127.0.0.1:5000",
        protocol: "http:",
      },
      localStorage: fakeStorage,
      setTimeout,
    },
  })

  try {
    const mountedRef = { current: true }
    const reconnectEnabledRef = { current: true }
    const reconnectAttemptRef = { current: 0 }
    const wsRef = { current: null as WebSocket | null }
    const reconnectRef = { current: null as number | null }

    const cleanup = bindAutoLogoutSocket({
      username: "staff.user",
      mountedRef,
      reconnectEnabledRef,
      reconnectAttemptRef,
      wsRef,
      reconnectRef,
      clearReconnect() {
        reconnectRef.current = null
      },
      cleanupSocket() {
        disposeAutoLogoutSocket(wsRef.current, wsRef)
      },
      async runClientLogout() {
        logoutCalls += 1
        setBannedSessionFlag(false)
      },
      setReconnectTimeout: window.setTimeout,
    })

    const socket = sockets[0]
    assert.ok(socket)
    socket.onmessage?.call(socket as unknown as WebSocket, {
      data: JSON.stringify({
        type: "banned",
        reason: "blocked",
      }),
    } as MessageEvent)

    await Promise.resolve()
    await Promise.resolve()

    assert.equal(logoutCalls, 1)
    assert.equal(closeCalls, 1)
    assert.equal(reconnectEnabledRef.current, false)
    assert.equal(wsRef.current, null)
    assert.equal(isBannedSessionFlagSet(), true)
    assert.equal((window.location as Location).href, "http://127.0.0.1:5000/app")

    cleanup?.()
  } finally {
    setBannedSessionFlag(false)
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    })
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
    })
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: originalWebSocket,
    })
  }
})

test("idle timeout websocket messages run client cleanup without forcing the banned flow", async () => {
  const originalWindow = globalThis.window
  const originalSessionStorage = globalThis.sessionStorage
  const originalWebSocket = globalThis.WebSocket
  const sessionStore = new Map<string, string>()
  const sockets: TestWebSocket[] = []
  let logoutCalls = 0
  let closeCalls = 0

  class TestWebSocket {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSED = 3

    readyState = TestWebSocket.OPEN
    onopen: ((this: WebSocket, event: Event) => unknown) | null = null
    onmessage: ((this: WebSocket, event: MessageEvent) => unknown) | null = null
    onclose: ((this: WebSocket, event: CloseEvent) => unknown) | null = null
    onerror: ((this: WebSocket, event: Event) => unknown) | null = null

    constructor(readonly url: string) {
      sockets.push(this)
    }

    close() {
      closeCalls += 1
      this.readyState = TestWebSocket.CLOSED
    }
  }

  const fakeStorage = {
    getItem(key: string) {
      return sessionStore.get(key) ?? null
    },
    setItem(key: string, value: string) {
      sessionStore.set(key, value)
    },
    removeItem(key: string) {
      sessionStore.delete(key)
    },
  }

  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: fakeStorage,
  })
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    value: TestWebSocket,
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      clearTimeout,
      dispatchEvent() {},
      location: {
        href: "http://127.0.0.1:5000/app",
        host: "127.0.0.1:5000",
        protocol: "http:",
      },
      localStorage: fakeStorage,
      setTimeout,
    },
  })

  try {
    const mountedRef = { current: true }
    const reconnectEnabledRef = { current: true }
    const reconnectAttemptRef = { current: 0 }
    const wsRef = { current: null as WebSocket | null }
    const reconnectRef = { current: null as number | null }

    const cleanup = bindAutoLogoutSocket({
      username: "staff.user",
      mountedRef,
      reconnectEnabledRef,
      reconnectAttemptRef,
      wsRef,
      reconnectRef,
      clearReconnect() {
        reconnectRef.current = null
      },
      cleanupSocket() {
        disposeAutoLogoutSocket(wsRef.current, wsRef)
      },
      async runClientLogout() {
        logoutCalls += 1
      },
      setReconnectTimeout: window.setTimeout,
    })

    const socket = sockets[0]
    assert.ok(socket)
    socket.onmessage?.call(socket as unknown as WebSocket, {
      data: JSON.stringify({
        type: "idle_timeout",
        reason: "Session expired due to inactivity",
      }),
    } as MessageEvent)

    await Promise.resolve()

    assert.equal(logoutCalls, 1)
    assert.equal(closeCalls, 0)
    assert.equal(reconnectEnabledRef.current, true)
    assert.equal(wsRef.current, socket as unknown as WebSocket)
    assert.equal(isBannedSessionFlagSet(), false)
    assert.equal((window.location as Location).href, "http://127.0.0.1:5000/app")

    cleanup?.()
  } finally {
    setBannedSessionFlag(false)
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    })
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
    })
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: originalWebSocket,
    })
  }
})

test("websocket logout failures are caught instead of becoming unhandled rejections", async () => {
  const originalWindow = globalThis.window
  const originalSessionStorage = globalThis.sessionStorage
  const originalWebSocket = globalThis.WebSocket
  const sessionStore = new Map<string, string>()
  const sockets: TestWebSocket[] = []
  const unhandledRejections: unknown[] = []
  let logoutCalls = 0

  class TestWebSocket {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSED = 3

    readyState = TestWebSocket.OPEN
    onopen: ((this: WebSocket, event: Event) => unknown) | null = null
    onmessage: ((this: WebSocket, event: MessageEvent) => unknown) | null = null
    onclose: ((this: WebSocket, event: CloseEvent) => unknown) | null = null
    onerror: ((this: WebSocket, event: Event) => unknown) | null = null

    constructor(readonly url: string) {
      sockets.push(this)
    }

    close() {
      this.readyState = TestWebSocket.CLOSED
    }
  }

  const fakeStorage = {
    getItem(key: string) {
      return sessionStore.get(key) ?? null
    },
    setItem(key: string, value: string) {
      sessionStore.set(key, value)
    },
    removeItem(key: string) {
      sessionStore.delete(key)
    },
  }
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason)
  }

  process.on("unhandledRejection", onUnhandledRejection)
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: fakeStorage,
  })
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    value: TestWebSocket,
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      clearTimeout,
      dispatchEvent() {},
      location: {
        href: "http://127.0.0.1:5000/app",
        host: "127.0.0.1:5000",
        protocol: "http:",
      },
      localStorage: fakeStorage,
      setTimeout,
    },
  })

  try {
    const mountedRef = { current: true }
    const reconnectEnabledRef = { current: true }
    const reconnectAttemptRef = { current: 0 }
    const wsRef = { current: null as WebSocket | null }
    const reconnectRef = { current: null as number | null }

    const cleanup = bindAutoLogoutSocket({
      username: "staff.user",
      mountedRef,
      reconnectEnabledRef,
      reconnectAttemptRef,
      wsRef,
      reconnectRef,
      clearReconnect() {
        reconnectRef.current = null
      },
      cleanupSocket() {
        disposeAutoLogoutSocket(wsRef.current, wsRef)
      },
      async runClientLogout() {
        logoutCalls += 1
        throw new Error("logout failed")
      },
      setReconnectTimeout: window.setTimeout,
    })

    const socket = sockets[0]
    assert.ok(socket)
    socket.onmessage?.call(socket as unknown as WebSocket, {
      data: JSON.stringify({
        type: "logout",
        reason: "Forced logout",
      }),
    } as MessageEvent)

    await Promise.resolve()
    await Promise.resolve()
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })

    assert.equal(logoutCalls, 1)
    assert.deepEqual(unhandledRejections, [])

    cleanup?.()
  } finally {
    process.off("unhandledRejection", onUnhandledRejection)
    setBannedSessionFlag(false)
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    })
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
    })
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: originalWebSocket,
    })
  }
})
