import assert from "node:assert/strict"
import test from "node:test"

import { buildActivityRowAriaLabel } from "@/pages/activity/activity-row-aria"
import type { ActivityRecord } from "@/pages/activity/types"

const activity: ActivityRecord = {
  id: "activity-1",
  username: "operator.one",
  role: "admin",
  status: "ONLINE",
  ipAddress: "127.0.0.1",
  browser: "Chrome 123",
  loginTime: "2026-04-13T02:00:00.000Z",
  isActive: true,
}

test("buildActivityRowAriaLabel keeps activity summaries screen-reader friendly", () => {
  const label = buildActivityRowAriaLabel(activity, "Chrome 123", {
    index: 3,
    total: 12,
  })

  assert.match(label, /Activity for operator\.one/)
  assert.match(label, /role admin/)
  assert.match(label, /status online/)
  assert.match(label, /browser Chrome 123/)
  assert.match(label, /IP 127\.0\.0\.1/)
  assert.match(label, /record 3 of 12/)
})
