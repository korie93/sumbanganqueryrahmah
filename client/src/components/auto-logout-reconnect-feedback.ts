export type AutoLogoutReconnectFeedbackState = Readonly<{
  visible: boolean
  attempt: number
  retryDelayMs: number | null
}>

export const AUTO_LOGOUT_RECONNECT_FEEDBACK_IDLE_STATE: AutoLogoutReconnectFeedbackState =
  Object.freeze({
    visible: false,
    attempt: 0,
    retryDelayMs: null,
  })

export function createAutoLogoutReconnectFeedbackState(
  attempt: number,
  retryDelayMs: number,
): AutoLogoutReconnectFeedbackState {
  return {
    visible: true,
    attempt: Math.max(1, Math.trunc(attempt) + 1),
    retryDelayMs: Math.max(0, Math.round(retryDelayMs)),
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
  if (!state.visible || state.retryDelayMs === null) {
    return ""
  }

  return `Percubaan ${state.attempt}. Cuba semula dalam ${formatAutoLogoutReconnectDelay(state.retryDelayMs)}.`
}
