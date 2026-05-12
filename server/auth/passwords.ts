import bcrypt from "bcrypt";
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { runtimeConfig } from "../config/runtime";
import {
  CREDENTIAL_BCRYPT_COST,
  CREDENTIAL_PASSWORD_MAX_LENGTH,
  isCredentialPasswordWithinMaxLength,
} from "./credentials";
import { isBcryptHash } from "./account-lifecycle";

const TEMP_PASSWORD_UPPERCASE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TEMP_PASSWORD_LOWERCASE_ALPHABET = "abcdefghijkmnopqrstuvwxyz";
const TEMP_PASSWORD_DIGIT_ALPHABET = "23456789";
const TEMP_PASSWORD_SYMBOL_ALPHABET = "!@#$%^&*()-_=+";
const TEMP_PASSWORD_ALPHABET =
  `${TEMP_PASSWORD_UPPERCASE_ALPHABET}${TEMP_PASSWORD_LOWERCASE_ALPHABET}${TEMP_PASSWORD_DIGIT_ALPHABET}${TEMP_PASSWORD_SYMBOL_ALPHABET}`;
const OPAQUE_TOKEN_HASH_PREFIX = "hmac-sha256:";
const OPAQUE_TOKEN_HASH_INFO = "sqr-auth-opaque-token-hash-v1";

function pickRandomCharacter(alphabet = TEMP_PASSWORD_ALPHABET): string {
  const index = randomInt(alphabet.length);
  return alphabet[index];
}

function shuffleCharacters(characters: string[]): string[] {
  const next = [...characters];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export async function hashPassword(raw: string): Promise<string> {
  if (!isCredentialPasswordWithinMaxLength(raw)) {
    throw new Error(`Password exceeds the maximum supported length of ${CREDENTIAL_PASSWORD_MAX_LENGTH} characters.`);
  }

  return bcrypt.hash(raw, CREDENTIAL_BCRYPT_COST);
}

let dummyBcryptHashPromise: Promise<string> | null = null;

export function initializeDummyBcryptHash(): Promise<string> {
  if (!dummyBcryptHashPromise) {
    const dummyPassword = randomBytes(32).toString("base64url");
    dummyBcryptHashPromise = bcrypt.hash(dummyPassword, CREDENTIAL_BCRYPT_COST).catch((error: unknown) => {
      dummyBcryptHashPromise = null;
      throw error;
    });
  }

  return dummyBcryptHashPromise;
}

export function resetDummyBcryptHashForTests() {
  dummyBcryptHashPromise = null;
}

export async function verifyPassword(raw: string, hash: string | null | undefined): Promise<boolean> {
  if (!isCredentialPasswordWithinMaxLength(raw)) {
    return false;
  }

  const normalizedHash = String(hash || "").trim();
  if (!normalizedHash || !isBcryptHash(normalizedHash)) {
    // Perform a dummy comparison to prevent timing-based user enumeration.
    await bcrypt.compare(raw, await initializeDummyBcryptHash());
    return false;
  }
  return bcrypt.compare(raw, normalizedHash);
}

export function generateOneTimeToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function hashLegacyOpaqueToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function hashOpaqueTokenWithSecret(raw: string, secret: string): string {
  const digest = createHmac("sha256", String(secret))
    .update(OPAQUE_TOKEN_HASH_INFO)
    .update("\0")
    .update(raw)
    .digest("hex");
  return `${OPAQUE_TOKEN_HASH_PREFIX}${digest}`;
}

export function hashOpaqueToken(raw: string): string {
  return hashOpaqueTokenWithSecret(raw, runtimeConfig.auth.sessionSecret);
}

export function getOpaqueTokenHashCandidates(raw: string): string[] {
  const hashes = new Set<string>();
  const secrets = [
    runtimeConfig.auth.sessionSecret,
    ...runtimeConfig.auth.previousSessionSecrets,
  ];

  for (const secret of secrets) {
    const normalizedSecret = String(secret || "").trim();
    if (normalizedSecret) {
      hashes.add(hashOpaqueTokenWithSecret(raw, normalizedSecret));
    }
  }
  hashes.add(hashLegacyOpaqueToken(raw));

  return Array.from(hashes);
}

export function generateTemporaryPassword(length = 18): string {
  const safeLength = Math.max(16, length);
  const characters: string[] = [];

  while (characters.length < safeLength - 4) {
    characters.push(pickRandomCharacter());
  }

  characters.push(
    pickRandomCharacter(TEMP_PASSWORD_UPPERCASE_ALPHABET),
    pickRandomCharacter(TEMP_PASSWORD_LOWERCASE_ALPHABET),
    pickRandomCharacter(TEMP_PASSWORD_DIGIT_ALPHABET),
    pickRandomCharacter(TEMP_PASSWORD_SYMBOL_ALPHABET),
  );

  return shuffleCharacters(characters).join("");
}
