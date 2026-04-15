import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { BrandLogo } from "@/components/BrandLogo"

test("BrandLogo keeps informative alt text and hides decorative usage from assistive tech", () => {
  const informativeMarkup = renderToStaticMarkup(
    createElement(BrandLogo, {
      alt: "Sistem SQR",
    }),
  )
  const decorativeMarkup = renderToStaticMarkup(
    createElement(BrandLogo, {
      decorative: true,
    }),
  )

  assert.match(informativeMarkup, /<img[^>]*alt="Sistem SQR"/)
  assert.doesNotMatch(informativeMarkup, /aria-hidden="true"/)

  assert.match(decorativeMarkup, /<img[^>]*alt=""/)
  assert.match(decorativeMarkup, /aria-hidden="true"/)
})
