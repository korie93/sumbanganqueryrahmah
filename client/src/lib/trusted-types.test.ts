import assert from "node:assert/strict"
import test from "node:test"

import { SQR_TRUSTED_TYPES_POLICY_NAME } from "../../../shared/trusted-types"
import { toTrustedHTML } from "./trusted-types"

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
        }
      },
    }

    assert.equal(toTrustedHTML("<b>hello</b>"), "trusted:<b>hello</b>")
    assert.equal(toTrustedHTML("<i>world</i>"), "trusted:<i>world</i>")
    assert.equal(createPolicyCalls, 1)
    assert.equal(createHTMLCalls, 2)
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
