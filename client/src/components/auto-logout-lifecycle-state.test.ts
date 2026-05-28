import assert from "node:assert/strict"
import test from "node:test"

import {
  autoLogoutLifecycleReducer,
  initialAutoLogoutLifecycleState,
} from "@/components/auto-logout-lifecycle-state"

test("autoLogoutLifecycleReducer resets transient state when a session starts", () => {
  const previous = {
    ...initialAutoLogoutLifecycleState,
    mounted: false,
    reconnectEnabled: false,
    logoutStarted: true,
    reconnectAttempt: 7,
    activityListenersAttached: true,
    lastHeartbeatSyncAt: 12_345,
  }

  const next = autoLogoutLifecycleReducer(previous, { type: "SESSION_STARTED" })

  assert.equal(next.mounted, true)
  assert.equal(next.reconnectEnabled, true)
  assert.equal(next.logoutStarted, false)
  assert.equal(next.reconnectAttempt, 0)
  assert.equal(next.activityListenersAttached, true)
  assert.equal(next.lastHeartbeatSyncAt, 0)
})

test("autoLogoutLifecycleReducer makes logout an idempotent terminal transition", () => {
  const loggingOut = autoLogoutLifecycleReducer(
    {
      ...initialAutoLogoutLifecycleState,
      reconnectAttempt: 3,
    },
    { type: "LOGOUT_STARTED" },
  )

  assert.equal(loggingOut.logoutStarted, true)
  assert.equal(loggingOut.reconnectEnabled, false)
  assert.equal(loggingOut.reconnectAttempt, 0)

  const repeated = autoLogoutLifecycleReducer(loggingOut, { type: "LOGOUT_STARTED" })

  assert.equal(repeated, loggingOut)
})

test("autoLogoutLifecycleReducer bounds reconnect attempts and records heartbeat syncs", () => {
  const withNegativeAttempt = autoLogoutLifecycleReducer(
    initialAutoLogoutLifecycleState,
    {
      type: "RECONNECT_ATTEMPT_SET",
      value: -4,
    },
  )

  assert.equal(withNegativeAttempt.reconnectAttempt, 0)

  const withHeartbeat = autoLogoutLifecycleReducer(withNegativeAttempt, {
    type: "HEARTBEAT_SYNCED",
    atMs: 50_000,
  })

  assert.equal(withHeartbeat.lastHeartbeatSyncAt, 50_000)
})

test("autoLogoutLifecycleReducer tracks listener attachment and unmount lifecycle", () => {
  const attached = autoLogoutLifecycleReducer(initialAutoLogoutLifecycleState, {
    type: "ACTIVITY_LISTENERS_ATTACHED_SET",
    value: true,
  })

  assert.equal(attached.activityListenersAttached, true)

  const unmounted = autoLogoutLifecycleReducer(attached, {
    type: "COMPONENT_UNMOUNTED",
  })

  assert.equal(unmounted.mounted, false)
  assert.equal(unmounted.reconnectEnabled, false)
  assert.equal(unmounted.reconnectAttempt, 0)
  assert.equal(unmounted.activityListenersAttached, true)
})
