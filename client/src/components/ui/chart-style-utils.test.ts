import assert from "node:assert/strict"
import test from "node:test"

import {
  buildChartStyleMarkup,
  resolveChartPresentationColor,
  sanitizeChartColorValue,
  sanitizeChartToken,
} from "@/components/ui/chart-style-utils"

test("sanitizeChartToken normalizes unsafe ids into stable CSS tokens", () => {
  assert.equal(sanitizeChartToken(" chart:daily/logins "), "chart-daily-logins")
  assert.equal(sanitizeChartToken(""), "chart")
})

test("sanitizeChartColorValue keeps safe CSS color text and rejects unsafe input", () => {
  assert.equal(sanitizeChartColorValue("hsl(210 80% 50%)"), "hsl(210 80% 50%)")
  assert.equal(sanitizeChartColorValue("url(javascript:alert(1))"), null)
})

test("buildChartStyleMarkup emits CSS variables only for safe configured colors", () => {
  const markup = buildChartStyleMarkup("chart:daily", {
    logins: {
      label: "Logins",
      theme: { light: "#2563eb", dark: "#60a5fa" },
    },
    ignored: {
      label: "Ignored",
      color: "url(javascript:alert(1))",
    },
  })

  assert.ok(markup)
  assert.match(markup, /\[data-chart="chart-daily"]/)
  assert.match(markup, /--color-logins: #2563eb;/)
  assert.doesNotMatch(markup, /--color-ignored/)
})

test("resolveChartPresentationColor falls back to currentColor for invalid values", () => {
  assert.equal(resolveChartPresentationColor("#9333ea"), "#9333ea")
  assert.equal(
    resolveChartPresentationColor("url(javascript:alert(1))"),
    "currentColor"
  )
})
