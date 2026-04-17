import assert from "node:assert/strict"
import test from "node:test"

import {
  AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE,
  buildAutoLogoutReconnectFeedbackTitle,
  buildAutoLogoutReconnectFeedbackMessage,
  createAutoLogoutReconnectTerminalState,
  createAutoLogoutReconnectFeedbackState,
  formatAutoLogoutReconnectDelay,
} from "@/components/auto-logout-reconnect-feedback"

test("createAutoLogoutReconnectFeedbackState normalizes user-facing reconnect attempts", () => {
  assert.deepEqual(createAutoLogoutReconnectFeedbackState(0, 800), {
    visible: true,
    mode: "retrying",
    attempt: 1,
    retryDelayMs: 800,
    terminalMessage: null,
  })
  assert.deepEqual(createAutoLogoutReconnectFeedbackState(2, 4_250), {
    visible: true,
    mode: "retrying",
    attempt: 3,
    retryDelayMs: 4250,
    terminalMessage: null,
  })
})

test("buildAutoLogoutReconnectFeedbackMessage keeps reconnect copy readable", () => {
  assert.equal(buildAutoLogoutReconnectFeedbackMessage(AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE), "")
  assert.equal(buildAutoLogoutReconnectFeedbackTitle(AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE), "Menyambung semula sesi")
  assert.equal(formatAutoLogoutReconnectDelay(800), "800 ms")
  assert.equal(formatAutoLogoutReconnectDelay(1_600), "1.6 saat")
  assert.equal(
    buildAutoLogoutReconnectFeedbackMessage(createAutoLogoutReconnectFeedbackState(1, 1_600)),
    "Percubaan 2. Cuba semula dalam 1.6 saat.",
  )
})

test("terminal reconnect feedback shows a non-retrying recovery message", () => {
  const terminalState = createAutoLogoutReconnectTerminalState("Sesi tidak lagi sah.")

  assert.deepEqual(terminalState, {
    visible: true,
    mode: "terminal",
    attempt: 0,
    retryDelayMs: null,
    terminalMessage: "Sesi tidak lagi sah.",
  })
  assert.equal(buildAutoLogoutReconnectFeedbackTitle(terminalState), "Sambungan sesi terhenti")
  assert.equal(buildAutoLogoutReconnectFeedbackMessage(terminalState), "Sesi tidak lagi sah.")
})
