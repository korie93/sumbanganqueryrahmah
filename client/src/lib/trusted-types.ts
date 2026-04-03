import { SQR_TRUSTED_TYPES_POLICY_NAME } from "../../../shared/trusted-types"

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
function getTrustedTypesPolicy() {
  const trustedTypesGlobal = globalThis as TrustedTypesGlobalLike

  if (trustedTypesGlobal.__sqrTrustedTypesPolicy) {
    return trustedTypesGlobal.__sqrTrustedTypesPolicy
  }

  if (trustedTypesGlobal.__sqrTrustedTypesPolicy === null) {
    return undefined
  }

  const trustedTypesFactory = trustedTypesGlobal.trustedTypes
  if (!trustedTypesFactory || typeof trustedTypesFactory.createPolicy !== "function") {
    trustedTypesGlobal.__sqrTrustedTypesPolicy = null
    return undefined
  }

  try {
    const policy = trustedTypesFactory.createPolicy(SQR_TRUSTED_TYPES_POLICY_NAME, {
      createHTML: (input) => input,
    })
    trustedTypesGlobal.__sqrTrustedTypesPolicy = policy
    return policy
  } catch {
    trustedTypesGlobal.__sqrTrustedTypesPolicy = null
    return undefined
  }
}

export function toTrustedHTML(html: string): string {
  const policy = getTrustedTypesPolicy()
  if (!policy) {
    return html
  }

  return policy.createHTML(html) as unknown as string
}
