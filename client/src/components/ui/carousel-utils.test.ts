import assert from "node:assert/strict"
import test from "node:test"

import { bindCarouselSelectionEvents } from "@/components/ui/carousel-utils"

test("bindCarouselSelectionEvents subscribes and unsubscribes both carousel lifecycle events", () => {
  const registered = new Map<string, (api: MockCarouselApi) => void>()
  const activity: string[] = []

  type MockCarouselApi = {
    on: (event: "reInit" | "select", callback: (api: MockCarouselApi) => void) => void
    off: (event: "reInit" | "select", callback: (api: MockCarouselApi) => void) => void
  }

  const api: MockCarouselApi = {
    on(event, callback) {
      registered.set(event, callback)
      activity.push(`on:${event}`)
    },
    off(event, callback) {
      assert.equal(callback, registered.get(event))
      activity.push(`off:${event}`)
    },
  }

  let selectedWith: MockCarouselApi | null = null
  const cleanup = bindCarouselSelectionEvents(api, (currentApi) => {
    selectedWith = currentApi
    activity.push("select")
  })

  assert.equal(selectedWith, api)
  assert.deepEqual(activity.slice(0, 3), ["select", "on:reInit", "on:select"])

  cleanup()

  assert.deepEqual(activity.slice(-2), ["off:reInit", "off:select"])
})

test("bindCarouselSelectionEvents returns a safe no-op cleanup when the carousel API is unavailable", () => {
  const cleanup = bindCarouselSelectionEvents(undefined, () => {
    throw new Error("should not be called")
  })

  assert.doesNotThrow(() => cleanup())
})
