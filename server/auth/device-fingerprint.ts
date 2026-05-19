import { createHmac, timingSafeEqual } from "node:crypto";
import { runtimeConfig } from "../config/runtime";

const DEVICE_FINGERPRINT_HASH_PREFIX = "hmac-sha256:";
const DEVICE_FINGERPRINT_HASH_CONTEXT = "sqr-auth-device-fingerprint-v1";
const DEVICE_FINGERPRINT_HASH_PATTERN = /^hmac-sha256:[a-f0-9]{64}$/i;

function normalizeDeviceFingerprint(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function isHashedDeviceFingerprint(value: string | null | undefined): boolean {
  const normalized = normalizeDeviceFingerprint(value);
  return normalized !== null && DEVICE_FINGERPRINT_HASH_PATTERN.test(normalized);
}

export function hashDeviceFingerprint(value: string | null | undefined): string | null {
  const normalized = normalizeDeviceFingerprint(value);
  if (normalized === null) {
    return null;
  }
  if (isHashedDeviceFingerprint(normalized)) {
    return normalized.toLowerCase();
  }

  const digest = createHmac("sha256", runtimeConfig.auth.sessionSecret)
    .update(DEVICE_FINGERPRINT_HASH_CONTEXT)
    .update("\0")
    .update(normalized)
    .digest("hex");

  return `${DEVICE_FINGERPRINT_HASH_PREFIX}${digest}`;
}

export function getDeviceFingerprintLookupCandidates(value: string | null | undefined): string[] {
  const normalized = normalizeDeviceFingerprint(value);
  if (normalized === null) {
    return [];
  }

  const hashed = hashDeviceFingerprint(normalized);
  const candidates = hashed === null ? [normalized] : [hashed, normalized];
  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
}

export function deviceFingerprintMatchesStored(
  candidate: string | null | undefined,
  stored: string | null | undefined,
): boolean {
  const normalizedCandidate = normalizeDeviceFingerprint(candidate);
  const normalizedStored = normalizeDeviceFingerprint(stored);
  if (normalizedCandidate === null || normalizedStored === null) {
    return false;
  }

  return getDeviceFingerprintLookupCandidates(normalizedCandidate).some((lookup) => {
    const left = Buffer.from(lookup);
    const right = Buffer.from(normalizedStored);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}
