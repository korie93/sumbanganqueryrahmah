import createDOMPurify from "dompurify"
import { getSqrTrustedTypesPolicy } from "./trusted-types"

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
  __sqrTrustedTypesDefaultPolicy?: TrustedTypesPolicyLike | null
}

function sanitizeTrustedTypesHtml(input: string) {
  if (typeof window === "undefined" || !window.document) {
    return input
  }

  const purifier = createDOMPurify(window)
  const trustedTypesPolicy = getSqrTrustedTypesPolicy()
  const domPurifyTrustedTypesPolicy =
    trustedTypesPolicy && typeof trustedTypesPolicy.createScriptURL === "function"
      ? trustedTypesPolicy
      : undefined
  return purifier.sanitize(input, {
    RETURN_TRUSTED_TYPE: false,
    ...(domPurifyTrustedTypesPolicy
      ? { TRUSTED_TYPES_POLICY: domPurifyTrustedTypesPolicy as never }
      : {}),
  })
}

export function initializeTrustedTypesRuntime(
  sanitizeHtml: (input: string) => string = sanitizeTrustedTypesHtml
) {
  const trustedTypesGlobal = globalThis as TrustedTypesGlobalLike

  if (trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy !== undefined) {
    return trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy || undefined
  }

  const trustedTypesFactory = trustedTypesGlobal.trustedTypes
  if (!trustedTypesFactory || typeof trustedTypesFactory.createPolicy !== "function") {
    trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy = null
    return undefined
  }

  try {
    const policy = trustedTypesFactory.createPolicy("default", {
      createHTML: (input) => sanitizeHtml(input),
      createScriptURL: (input) => input,
    })
    trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy = policy
    return policy
  } catch {
    trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy = null
    return undefined
  }
}
