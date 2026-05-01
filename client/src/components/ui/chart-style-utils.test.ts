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
  assert.equal(sanitizeChartColorValue("var(--chart-1)"), "var(--chart-1)")
  assert.equal(sanitizeChartColorValue("url(javascript:alert(1))"), null)
  assert.equal(sanitizeChartColorValue("expression(alert(1))"), null)
  assert.equal(sanitizeChartColorValue("</style><script>alert(1)</script>"), null)
  assert.equal(sanitizeChartColorValue("red;background:blue"), null)
  assert.equal(sanitizeChartColorValue(String.raw`hsl\(210 80% 50%\)`), null)
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
  assert.doesNotMatch(markup, /<\/style>/i)
  assert.doesNotMatch(markup, /javascript:/i)
  assert.doesNotMatch(markup, /expression\(/i)
})

test("buildChartStyleMarkup drops injected selector and style-breaking content", () => {
  const markup = buildChartStyleMarkup("chart:\"></style><script>alert(1)</script>", {
    injected: {
      label: "Injected",
      color: "\";background:url(javascript:alert(1))",
    },
  })

  assert.ok(markup)
  assert.doesNotMatch(markup, /<\/style>/i)
  assert.doesNotMatch(markup, /<script>/i)
  assert.doesNotMatch(markup, /javascript:/i)
  assert.match(markup, /\[data-chart="chart-[a-z0-9-]+"]/i)
  assert.doesNotMatch(markup, /--color-injected/)
})

test("buildChartStyleMarkup sanitizes series keys before CSS variable emission", () => {
  const markup = buildChartStyleMarkup("chart:daily", {
    "safe; color": {
      label: "Safe",
      color: "#0ea5e9",
    },
  })

  assert.ok(markup)
  assert.match(markup, /--color-safe--color: #0ea5e9;/)
  assert.doesNotMatch(markup, /safe; color/)
})

test("resolveChartPresentationColor falls back to currentColor for invalid values", () => {
  assert.equal(resolveChartPresentationColor("#9333ea"), "#9333ea")
  assert.equal(
    resolveChartPresentationColor("url(javascript:alert(1))"),
    "currentColor"
  )
})
