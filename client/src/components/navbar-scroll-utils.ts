const NAVBAR_KEYBOARD_SCROLL_MIN_STEP_PX = 120
const NAVBAR_KEYBOARD_SCROLL_STEP_RATIO = 0.4

export function resolveNavbarKeyboardScrollStep(clientWidth: number) {
  if (!Number.isFinite(clientWidth) || clientWidth <= 0) {
    return NAVBAR_KEYBOARD_SCROLL_MIN_STEP_PX
  }

  return Math.max(
    NAVBAR_KEYBOARD_SCROLL_MIN_STEP_PX,
    Math.round(clientWidth * NAVBAR_KEYBOARD_SCROLL_STEP_RATIO)
  )
}

export function getNavbarKeyboardScrollLeftDelta(key: string, clientWidth: number) {
  const step = resolveNavbarKeyboardScrollStep(clientWidth)

  if (key === "ArrowLeft") {
    return -step
  }

  if (key === "ArrowRight") {
    return step
  }

  return 0
}
