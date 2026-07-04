import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { closeRuntimeWebSocketServerState } from "../runtime-server-close";
import { RuntimeSocketLifecycleRegistry } from "../runtime-socket-lifecycle-registry";

class ThrowingCloseWebSocket {
  readyState: number = WebSocket.OPEN;
  closeCalls = 0;
  terminateCalls = 0;

  close() {
    this.closeCalls += 1;
    throw new Error("close failed");
  }

  terminate() {
    this.terminateCalls += 1;
    this.readyState = WebSocket.CLOSED;
  }
}

test("runtime server close terminates tracked sockets when close throws", () => {
  const connectedClients = new Map<string, WebSocket>();
  const lifecycleRegistry = new RuntimeSocketLifecycleRegistry(connectedClients);
  const socket = new ThrowingCloseWebSocket();
  let cleanupCalls = 0;
  const heartbeatHandle = setInterval(() => undefined, 60_000);

  lifecycleRegistry.trackSocket(socket as unknown as WebSocket, () => {
    cleanupCalls += 1;
  });

  closeRuntimeWebSocketServerState({
    cleanupClient: () => false,
    heartbeatHandle,
    lifecycleRegistry,
  });

  assert.equal(cleanupCalls, 1);
  assert.equal(socket.closeCalls, 1);
  assert.equal(socket.terminateCalls, 1);
  assert.deepEqual(lifecycleRegistry.getSnapshot(), {
    cleanupCallbacks: 0,
    connectedClients: 0,
    socketEntriesByActivity: 0,
    socketEntriesByInstance: 0,
    trackedSockets: 0,
  });
});
