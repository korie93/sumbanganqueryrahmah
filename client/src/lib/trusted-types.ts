import createDOMPurify from "dompurify"
import { SQR_TRUSTED_TYPES_POLICY_NAME } from "../../../shared/trusted-types"
import { sanitizeTrustedScriptURL } from "./trusted-script-url"

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

let domPurifyInstance: ReturnType<typeof createDOMPurify> | null | undefined

function resolveTrustedTypesWindow() {
  if (typeof window === "undefined" || !window.document) {
    return null
  }

  return window
}

function getDomPurifyInstance() {
  if (domPurifyInstance !== undefined) {
    return domPurifyInstance
  }

  const trustedTypesWindow = resolveTrustedTypesWindow()
  domPurifyInstance = trustedTypesWindow ? createDOMPurify(trustedTypesWindow) : null
  return domPurifyInstance
}

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
  const purifier = getDomPurifyInstance()
  if (!purifier) {
    return fallbackSanitizeTrustedHtml(normalized)
  }

  return purifier.sanitize(normalized, {
    RETURN_TRUSTED_TYPE: false,
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "style"],
    FORBID_ATTR: ["style"],
  })
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
