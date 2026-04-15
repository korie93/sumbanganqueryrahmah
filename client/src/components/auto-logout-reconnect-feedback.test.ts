import assert from "node:assert/strict"
import test from "node:test"

import {
  AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE,
  buildAutoLogoutReconnectFeedbackMessage,
  createAutoLogoutReconnectFeedbackState,
  formatAutoLogoutReconnectDelay,
} from "@/components/auto-logout-reconnect-feedback"

test("createAutoLogoutReconnectFeedbackState normalizes user-facing reconnect attempts", () => {
  assert.deepEqual(createAutoLogoutReconnectFeedbackState(0, 800), {
    visible: true,
    attempt: 1,
    retryDelayMs: 800,
  })
  assert.deepEqual(createAutoLogoutReconnectFeedbackState(2, 4_250), {
    visible: true,
    attempt: 3,
    retryDelayMs: 4250,
  })
})

test("buildAutoLogoutReconnectFeedbackMessage keeps reconnect copy readable", () => {
  assert.equal(buildAutoLogoutReconnectFeedbackMessage(AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE), "")
  assert.equal(formatAutoLogoutReconnectDelay(800), "800 ms")
  assert.equal(formatAutoLogoutReconnectDelay(1_600), "1.6 saat")
  assert.equal(
    buildAutoLogoutReconnectFeedbackMessage(createAutoLogoutReconnectFeedbackState(1, 1_600)),
    "Percubaan 2. Cuba semula dalam 1.6 saat.",
  )
})
