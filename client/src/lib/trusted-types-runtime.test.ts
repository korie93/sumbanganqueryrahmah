import assert from "node:assert/strict"
import test from "node:test"

import { initializeTrustedTypesRuntime } from "./trusted-types-runtime"

type TrustedTypesPolicyLike = {
  createHTML: (input: string) => unknown
}

type TrustedTypesFactoryLike = {
  createPolicy: (
    name: string,
    rules: {
      createHTML: (input: string) => string
    }
  ) => TrustedTypesPolicyLike
}

type TrustedTypesGlobalLike = typeof globalThis & {
  trustedTypes?: TrustedTypesFactoryLike
  __sqrTrustedTypesDefaultPolicy?: TrustedTypesPolicyLike | null
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
    delete trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy
    return
  }

  trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy = previousPolicy
}

test("initializeTrustedTypesRuntime installs a default trusted types policy once", () => {
  const trustedTypesGlobal = globalThis as TrustedTypesGlobalLike
  const previousFactory = trustedTypesGlobal.trustedTypes
  const previousPolicy = trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy

  let createPolicyCalls = 0

  try {
    delete trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy
    trustedTypesGlobal.trustedTypes = {
      createPolicy(name, rules) {
        createPolicyCalls += 1
        assert.equal(name, "default")

        return {
          createHTML(input) {
            return `sanitized:${rules.createHTML(input)}`
          },
        }
      },
    }

    const policy = initializeTrustedTypesRuntime((input) => input.replace(/</g, "&lt;"))
    assert.equal(
      policy?.createHTML("<style>.x{}</style>"),
      "sanitized:&lt;style>.x{}&lt;/style>"
    )

    const secondPolicy = initializeTrustedTypesRuntime((input) => input)
    assert.equal(secondPolicy, policy)
    assert.equal(createPolicyCalls, 1)
  } finally {
    restoreTrustedTypesState(trustedTypesGlobal, previousFactory, previousPolicy)
  }
})

test("initializeTrustedTypesRuntime falls back cleanly when trusted types are unavailable", () => {
  const trustedTypesGlobal = globalThis as TrustedTypesGlobalLike
  const previousFactory = trustedTypesGlobal.trustedTypes
  const previousPolicy = trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy

  try {
    delete trustedTypesGlobal.trustedTypes
    delete trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy

    assert.equal(initializeTrustedTypesRuntime(), undefined)
    assert.equal(trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy, null)
  } finally {
    restoreTrustedTypesState(trustedTypesGlobal, previousFactory, previousPolicy)
  }
})
