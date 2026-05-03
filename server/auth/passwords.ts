import bcrypt from "bcrypt";
import { createHash, randomBytes, randomInt } from "node:crypto";
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

// Pre-computed bcrypt hash of a random value used for timing-safe comparison when
// the real password hash is missing or invalid. This ensures verifyPassword takes
// consistent time regardless of whether the user exists.
const DUMMY_BCRYPT_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7z6xUfIjm6";

export async function verifyPassword(raw: string, hash: string | null | undefined): Promise<boolean> {
  if (!isCredentialPasswordWithinMaxLength(raw)) {
    return false;
  }

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
