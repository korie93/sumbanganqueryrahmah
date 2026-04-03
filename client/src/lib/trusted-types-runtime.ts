import createDOMPurify from "dompurify"

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

function sanitizeTrustedTypesHtml(input: string) {
  if (typeof window === "undefined" || !window.document) {
    return input
  }

  const purifier = createDOMPurify(window)
  return purifier.sanitize(input, {
    RETURN_TRUSTED_TYPE: false,
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
    })
    trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy = policy
    return policy
  } catch {
    trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy = null
    return undefined
  }
}
