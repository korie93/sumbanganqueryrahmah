import assert from "node:assert/strict"
import test from "node:test"

import { disposeAutoLogoutSocket } from "@/components/auto-logout-socket-runtime"

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
