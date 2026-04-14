import assert from "node:assert/strict"
import test from "node:test"

import { readActivityFeedErrorMessage } from "@/pages/activity/activity-feed-error-utils"

test("readActivityFeedErrorMessage ignores aborted requests", () => {
  assert.equal(readActivityFeedErrorMessage(new DOMException("aborted", "AbortError")), null)
})

test("readActivityFeedErrorMessage maps offline and timeout failures to user-facing copy", () => {
  assert.equal(
    readActivityFeedErrorMessage(new Error("Offline request failed")),
    "Aktiviti tidak dapat dimuat semula kerana peranti ini kelihatan offline."
  )
  assert.equal(
    readActivityFeedErrorMessage(new Error("Request timed out after 5000ms")),
    "Aktiviti mengambil masa terlalu lama untuk dimuat semula. Sila cuba lagi."
  )
})

test("readActivityFeedErrorMessage falls back to a stable generic message", () => {
  assert.equal(
    readActivityFeedErrorMessage(new Error("socket hang up")),
    "Aktiviti tidak dapat dimuat semula sekarang. Sila semak sambungan rangkaian dan cuba lagi."
  )
})
