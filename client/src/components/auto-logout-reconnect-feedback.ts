export type AutoLogoutReconnectFeedbackState = Readonly<{
  visible: boolean
  mode: "idle" | "retrying" | "terminal"
  attempt: number
  retryDelayMs: number | null
  terminalMessage: string | null
}>

export const AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE: AutoLogoutReconnectFeedbackState =
  Object.freeze({
    visible: false,
    mode: "idle",
    attempt: 0,
    retryDelayMs: null,
    terminalMessage: null,
  })

export function createAutoLogoutReconnectFeedbackState(
  attempt: number,
  retryDelayMs: number,
): AutoLogoutReconnectFeedbackState {
  return {
    visible: true,
    mode: "retrying",
    attempt: Math.max(1, Math.trunc(attempt) + 1),
    retryDelayMs: Math.max(0, Math.round(retryDelayMs)),
    terminalMessage: null,
  }
}

export function createAutoLogoutReconnectTerminalState(
  terminalMessage: string,
): AutoLogoutReconnectFeedbackState {
  return {
    visible: true,
    mode: "terminal",
    attempt: 0,
    retryDelayMs: null,
    terminalMessage: String(terminalMessage || "").trim() || "Sambungan sesi tidak dapat dipulihkan.",
  }
}

export function formatAutoLogoutReconnectDelay(retryDelayMs: number): string {
  if (retryDelayMs >= 1_000) {
    const seconds = retryDelayMs / 1_000
    return Number.isInteger(seconds) ? `${seconds} saat` : `${seconds.toFixed(1)} saat`
  }

  return `${retryDelayMs} ms`
}

export function buildAutoLogoutReconnectFeedbackMessage(
  state: AutoLogoutReconnectFeedbackState,
): string {
  if (!state.visible) {
    return ""
  }

  if (state.mode === "terminal") {
    return state.terminalMessage ?? ""
  }

  if (state.retryDelayMs === null) {
    return ""
  }

  return `Percubaan ${state.attempt}. Cuba semula dalam ${formatAutoLogoutReconnectDelay(state.retryDelayMs)}.`
}

export function buildAutoLogoutReconnectFeedbackTitle(
  state: AutoLogoutReconnectFeedbackState,
): string {
  return state.mode === "terminal" ? "Sambungan sesi terhenti" : "Menyambung semula sesi"
}
