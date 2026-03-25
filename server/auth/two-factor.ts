import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from "node:crypto";
import { getTwoFactorEncryptionSecret } from "../config/security";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(value: string) {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[^A-Z2-7]/g, "");

  let bits = 0;
  let current = 0;
  const output: number[] = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      continue;
    }

    current = (current << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((current >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function getTwoFactorCipherKey() {
  return createHash("sha256").update(getTwoFactorEncryptionSecret()).digest();
}

function generateTotpAt(secret: string, timestampMs: number) {
  const key = base32Decode(secret);
  const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (
    ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff)
  ) % (10 ** TOTP_DIGITS);
  return String(binary).padStart(TOTP_DIGITS, "0");
}

export function generateTwoFactorSecret() {
  return base32Encode(randomBytes(20));
}

export function normalizeTwoFactorCode(value: string) {
  return String(value || "").replace(/\D/g, "").slice(0, TOTP_DIGITS);
}

export function verifyTwoFactorCode(secret: string, rawCode: string, window = 1) {
  const code = normalizeTwoFactorCode(rawCode);
  if (code.length !== TOTP_DIGITS) {
    return false;
  }

  const now = Date.now();
  for (let step = -window; step <= window; step += 1) {
    const candidate = generateTotpAt(secret, now + step * TOTP_PERIOD_SECONDS * 1000);
    if (candidate === code) {
      return true;
    }
  }

  return false;
}

export function generateCurrentTwoFactorCode(secret: string) {
  return generateTotpAt(secret, Date.now());
}

export function encryptTwoFactorSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getTwoFactorCipherKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptTwoFactorSecret(payload: string) {
  const [ivRaw, ciphertextRaw, tagRaw] = String(payload || "").split(".");
  if (!ivRaw || !ciphertextRaw || !tagRaw) {
    throw new Error("Invalid 2FA secret payload.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getTwoFactorCipherKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function buildTwoFactorOtpAuthUrl(params: {
  issuer: string;
  username: string;
  secret: string;
}) {
  const issuer = String(params.issuer || "SQR").trim() || "SQR";
  const username = String(params.username || "").trim();
  const label = encodeURIComponent(`${issuer}:${username}`);
  const encodedIssuer = encodeURIComponent(issuer);
  const secret = encodeURIComponent(params.secret);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}
