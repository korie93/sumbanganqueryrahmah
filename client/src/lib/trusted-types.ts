import DOMPurify, { type Config as DOMPurifyConfig } from "dompurify"
import { SQR_TRUSTED_TYPES_POLICY_NAME } from "../../../shared/trusted-types"
import { sanitizeTrustedScriptURL } from "./trusted-script-url"

type TrustedTypesPolicyLike = {
  createHTML: (input: string) => unknown
  createScript?: (input: string) => unknown
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

const TRUSTED_STYLE_MARKUP_INVALID_PATTERNS = [
  /</,
  />/,
  /url\(/i,
  /expression\(/i,
  /@import/i,
  /\/\*/i,
  /\*\//i,
]

const TRUSTED_STYLE_MARKUP_ALLOWED_CHARS = /^[\s()[\]{};:,.%='"#/_\-a-zA-Z0-9]+$/

function fallbackSanitizeTrustedHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "")
    .replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/gi, "")
}

export function sanitizeTrustedHtml(input: string) {
  const normalized = String(input || "")
  if (!DOMPurify.isSupported || typeof DOMPurify.sanitize !== "function") {
    return fallbackSanitizeTrustedHtml(normalized)
  }

  // Share DOMPurify's native policy with AI and report sanitizers. A separate
  // instance would attempt a duplicate policy; a string-only bridge re-enters
  // SQR's default policy under strict Trusted Types and loses safe content.
  const domPurifyConfig: DOMPurifyConfig = {
    RETURN_TRUSTED_TYPE: false,
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "style"],
    FORBID_ATTR: ["style"],
  }

  return DOMPurify.sanitize(normalized, domPurifyConfig)
}

export function sanitizeTrustedStyleMarkup(input: string) {
  const normalized = String(input || "")
  if (!normalized.trim()) {
    return ""
  }

  if (
    TRUSTED_STYLE_MARKUP_INVALID_PATTERNS.some((pattern) => pattern.test(normalized))
    || !TRUSTED_STYLE_MARKUP_ALLOWED_CHARS.test(normalized)
  ) {
    throw new TypeError("Trusted style markup contains disallowed CSS text.")
  }

  return normalized
}

export function getSqrTrustedTypesPolicy() {
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
      createHTML: (input) => sanitizeTrustedHtml(input),
      createScriptURL: (input) => sanitizeTrustedScriptURL(input),
    })
    trustedTypesGlobal.__sqrTrustedTypesPolicy = policy
    return policy
  } catch {
    trustedTypesGlobal.__sqrTrustedTypesPolicy = null
    return undefined
  }
}

export function toTrustedHTML(html: string): string {
  const sanitizedHtml = sanitizeTrustedHtml(html)
  const policy = getSqrTrustedTypesPolicy()
  if (!policy) {
    return sanitizedHtml
  }

  return policy.createHTML(sanitizedHtml) as unknown as string
}

export function toTrustedStyleHTML(styleMarkup: string): string {
  const sanitizedStyleMarkup = sanitizeTrustedStyleMarkup(styleMarkup)
  const policy = getSqrTrustedTypesPolicy()
  if (!policy) {
    return sanitizedStyleMarkup
  }

  return policy.createHTML(sanitizedStyleMarkup) as unknown as string
}
