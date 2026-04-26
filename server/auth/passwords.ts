import bcrypt from "bcrypt";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { CREDENTIAL_BCRYPT_COST } from "./credentials";
import { isBcryptHash } from "./account-lifecycle";

const TEMP_PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";

function pickRandomCharacter(): string {
  const index = randomInt(TEMP_PASSWORD_ALPHABET.length);
  return TEMP_PASSWORD_ALPHABET[index];
}

export async function hashPassword(raw: string): Promise<string> {
  return bcrypt.hash(raw, CREDENTIAL_BCRYPT_COST);
}

// Pre-computed bcrypt hash of a random value used for timing-safe comparison when
// the real password hash is missing or invalid. This ensures verifyPassword takes
// consistent time regardless of whether the user exists.
const DUMMY_BCRYPT_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7z6xUfIjm6";

export async function verifyPassword(raw: string, hash: string | null | undefined): Promise<boolean> {
  const normalizedHash = String(hash || "").trim();
  if (!normalizedHash || !isBcryptHash(normalizedHash)) {
    // Perform a dummy comparison to prevent timing-based user enumeration.
    await bcrypt.compare(raw, DUMMY_BCRYPT_HASH);
    return false;
  }
  return bcrypt.compare(raw, normalizedHash);
}

export function generateOneTimeToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function hashOpaqueToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateTemporaryPassword(length = 18): string {
  const safeLength = Math.max(16, length);
  let next = "";
  while (next.length < safeLength) {
    next += pickRandomCharacter();
  }

  if (!/[A-Z]/.test(next)) next = `A${next.slice(1)}`;
  if (!/[a-z]/.test(next)) next = `${next.slice(0, 1)}a${next.slice(2)}`;
  if (!/\d/.test(next)) next = `${next.slice(0, 2)}7${next.slice(3)}`;
  if (!/[!@#$%^&*()\-_=+]/.test(next)) next = `${next.slice(0, 3)}!${next.slice(4)}`;
  return next;
}
