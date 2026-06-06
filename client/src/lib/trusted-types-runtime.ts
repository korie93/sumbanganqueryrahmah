import { sanitizeTrustedScriptURL } from "./trusted-script-url"
import { sanitizeTrustedHtml } from "./trusted-types"

export type TrustedTypesPolicyLike = {
  createHTML: (input: string) => unknown
  createScriptURL?: (input: string) => unknown
}

export type TrustedTypesFactoryLike = {
  createPolicy: (
    name: string,
    rules: {
      createHTML: (input: string) => string
      createScriptURL?: (input: string) => string
    }
  ) => TrustedTypesPolicyLike
}

export type TrustedTypesRuntimeGlobal = typeof globalThis & {
  trustedTypes?: TrustedTypesFactoryLike
  __sqrTrustedTypesDefaultPolicy?: TrustedTypesPolicyLike | null
}

export function initializeTrustedTypesRuntimeForGlobal(
  trustedTypesGlobal: TrustedTypesRuntimeGlobal,
  sanitizeHtml: (input: string) => string = sanitizeTrustedHtml
) {
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
      createScriptURL: (input) => sanitizeTrustedScriptURL(input),
    })
    trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy = policy
    return policy
  } catch {
    trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy = null
    return undefined
  }
}

export function initializeTrustedTypesRuntime(
  sanitizeHtml: (input: string) => string = sanitizeTrustedHtml
) {
  return initializeTrustedTypesRuntimeForGlobal(
    globalThis as TrustedTypesRuntimeGlobal,
    sanitizeHtml
  )
}
