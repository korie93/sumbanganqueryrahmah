import assert from "node:assert/strict"
import test from "node:test"

import { SQR_TRUSTED_TYPES_POLICY_NAME } from "../../../shared/trusted-types"
import { toTrustedHTML, toTrustedStyleHTML } from "./trusted-types"

type TrustedTypesPolicyLike = {
  createHTML: (input: string) => unknown
  createScriptURL?: (input: string) => unknown
}

type TrustedTypesFactoryLike = {
  createPolicy: (
    name: string,
    rules: {
      createHTML: (input: string) => string
      createScriptURL?: (input: string) => string
    }
  ) => TrustedTypesPolicyLike
}

type TrustedTypesGlobalLike = typeof globalThis & {
  trustedTypes?: TrustedTypesFactoryLike
  __sqrTrustedTypesPolicy?: TrustedTypesPolicyLike | null
}

function restoreTrustedTypesState(
  trustedTypesGlobal: TrustedTypesGlobalLike,
  previousFactory: TrustedTypesFactoryLike | undefined,
  previousPolicy: TrustedTypesPolicyLike | null | undefined
) {
  if (previousFactory) {
    trustedTypesGlobal.trustedTypes = previousFactory
  } else {
    delete trustedTypesGlobal.trustedTypes
  }

  if (previousPolicy === undefined) {
    delete trustedTypesGlobal.__sqrTrustedTypesPolicy
    return
  }

  trustedTypesGlobal.__sqrTrustedTypesPolicy = previousPolicy
}

test("toTrustedHTML creates and reuses the sqr trusted types policy when available", () => {
  const trustedTypesGlobal = globalThis as TrustedTypesGlobalLike
  const previousFactory = trustedTypesGlobal.trustedTypes
  const previousPolicy = trustedTypesGlobal.__sqrTrustedTypesPolicy

  let createPolicyCalls = 0
  let createHTMLCalls = 0
  let createScriptUrlCalls = 0

  try {
    delete trustedTypesGlobal.__sqrTrustedTypesPolicy
    trustedTypesGlobal.trustedTypes = {
      createPolicy(name, rules) {
        createPolicyCalls += 1
        assert.equal(name, SQR_TRUSTED_TYPES_POLICY_NAME)

        return {
          createHTML(input) {
            createHTMLCalls += 1
            return `trusted:${rules.createHTML(input)}`
          },
          createScriptURL(input) {
            createScriptUrlCalls += 1
            return `trusted-script:${rules.createScriptURL?.(input) ?? input}`
          },
        }
      },
    }

    assert.equal(toTrustedHTML("<b>hello</b>"), "trusted:<b>hello</b>")
    assert.equal(toTrustedHTML("<i>world</i>"), "trusted:<i>world</i>")
    const policy = trustedTypesGlobal.__sqrTrustedTypesPolicy as unknown as TrustedTypesPolicyLike
    assert.equal(policy.createScriptURL?.("/assets/app.js"), "trusted-script:/assets/app.js")
    assert.throws(
      () => policy.createScriptURL?.("javascript:alert(1)"),
      /protocol/i,
    )
    assert.equal(createPolicyCalls, 1)
    assert.equal(createHTMLCalls, 2)
    assert.equal(createScriptUrlCalls, 2)
  } finally {
    restoreTrustedTypesState(trustedTypesGlobal, previousFactory, previousPolicy)
  }
})

test("toTrustedHTML falls back safely when trusted types are unavailable", () => {
  const trustedTypesGlobal = globalThis as TrustedTypesGlobalLike
  const previousFactory = trustedTypesGlobal.trustedTypes
  const previousPolicy = trustedTypesGlobal.__sqrTrustedTypesPolicy

  try {
    delete trustedTypesGlobal.trustedTypes
    delete trustedTypesGlobal.__sqrTrustedTypesPolicy

    assert.equal(toTrustedHTML("<span>safe fallback</span>"), "<span>safe fallback</span>")
    assert.equal(trustedTypesGlobal.__sqrTrustedTypesPolicy, null)
  } finally {
    restoreTrustedTypesState(trustedTypesGlobal, previousFactory, previousPolicy)
  }
})

test("toTrustedHTML strips unsafe HTML payloads before creating trusted markup", () => {
  const trustedTypesGlobal = globalThis as TrustedTypesGlobalLike
  const previousFactory = trustedTypesGlobal.trustedTypes
  const previousPolicy = trustedTypesGlobal.__sqrTrustedTypesPolicy

  try {
    delete trustedTypesGlobal.trustedTypes
    delete trustedTypesGlobal.__sqrTrustedTypesPolicy

    const sanitized = toTrustedHTML(
      `<img src="javascript:alert(1)" onerror="alert(1)"><script>alert(1)</script><b>safe</b>`,
    )

    assert.equal(sanitized.includes("<script"), false)
    assert.equal(sanitized.includes("onerror"), false)
    assert.equal(sanitized.includes("javascript:"), false)
    assert.match(sanitized, /<b>safe<\/b>/)
  } finally {
    restoreTrustedTypesState(trustedTypesGlobal, previousFactory, previousPolicy)
  }
})

test("toTrustedStyleHTML keeps safe chart CSS text and rejects style breakouts", () => {
  assert.equal(
    toTrustedStyleHTML(`.dark [data-chart="chart-safe"] {\n  --color-series: hsl(210 80% 50% / 0.9);\n}`),
    `.dark [data-chart="chart-safe"] {\n  --color-series: hsl(210 80% 50% / 0.9);\n}`,
  )

  assert.throws(
    () => toTrustedStyleHTML(`</style><script>alert(1)</script>`),
    /Trusted style markup contains disallowed CSS text/i,
  )
  assert.throws(
    () => toTrustedStyleHTML(`[data-chart="chart-safe"] { background: url(javascript:alert(1)); }`),
    /Trusted style markup contains disallowed CSS text/i,
  )
})
