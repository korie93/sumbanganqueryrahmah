import { useCallback, useEffect, useRef } from "react"

type TimerCallback = () => void

/**
 * AUDIT2-FIX [L3]
 * Tracks timeouts and intervals created by a component and clears every
 * outstanding timer during unmount.
 *
 * Use this hook for component-owned timers so delayed callbacks do not fire
 * after the component lifecycle has ended.
 */
export function useTimers() {
  const timeoutIdsRef = useRef(new Set<number>())
  const intervalIdsRef = useRef(new Set<number>())

  const clearManagedTimeout = useCallback((timerId: number) => {
    window.clearTimeout(timerId)
    timeoutIdsRef.current.delete(timerId)
  }, [])

  const clearManagedInterval = useCallback((timerId: number) => {
    window.clearInterval(timerId)
    intervalIdsRef.current.delete(timerId)
  }, [])

  const setManagedTimeout = useCallback((callback: TimerCallback, delayMs: number) => {
    const timerId = window.setTimeout(() => {
      timeoutIdsRef.current.delete(timerId)
      callback()
    }, delayMs)
    timeoutIdsRef.current.add(timerId)
    return timerId
  }, [])

  const setManagedInterval = useCallback((callback: TimerCallback, delayMs: number) => {
    const timerId = window.setInterval(callback, delayMs)
    intervalIdsRef.current.add(timerId)
    return timerId
  }, [])

  const clearAllTimers = useCallback(() => {
    for (const timerId of timeoutIdsRef.current) {
      window.clearTimeout(timerId)
    }
    timeoutIdsRef.current.clear()

    for (const timerId of intervalIdsRef.current) {
      window.clearInterval(timerId)
    }
    intervalIdsRef.current.clear()
  }, [])

  useEffect(() => clearAllTimers, [clearAllTimers])

  return {
    clearAllTimers,
    clearManagedInterval,
    clearManagedTimeout,
    setManagedInterval,
    setManagedTimeout,
  } as const
}
