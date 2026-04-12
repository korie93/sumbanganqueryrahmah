import assert from "node:assert/strict"
import test from "node:test"

import {
  getPayloadConfigFromPayload,
  type ChartConfig,
} from "@/components/ui/chart-shared"

test("getPayloadConfigFromPayload resolves direct payload keys before falling back", () => {
  const config: ChartConfig = {
    logins: { label: "Logins", color: "#2563eb" },
    logouts: { label: "Logouts", color: "#7c3aed" },
  }

  const direct = getPayloadConfigFromPayload(
    config,
    { name: "logins" },
    "name"
  )
  const nested = getPayloadConfigFromPayload(
    config,
    { payload: { series: "logouts" } },
    "series"
  )
  const fallback = getPayloadConfigFromPayload(config, {}, "logins")

  assert.equal(direct?.label, "Logins")
  assert.equal(nested?.label, "Logouts")
  assert.equal(fallback?.label, "Logins")
})
