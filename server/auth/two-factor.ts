import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  getTwoFactorDecryptionSecrets,
  getTwoFactorEncryptionSecret,
  getTwoFactorTotpAlgorithm,
} from "../config/security";
import {
  internalMetrics,
  type InternalMetricsRecorder,
} from "../internal/metrics";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_SAFE_PATTERN = /^[A-Z2-7]+=*$/;
const BASE32_VALID_UNPADDED_REMAINDERS = new Set([0, 2, 4, 5, 7]);
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
export type TotpAlgorithm = "sha1" | "sha256";

export type DecryptedTwoFactorSecretPayload = {
  algorithm: TotpAlgorithm;
  secret: string;
};

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

function normalizeStrictBase32(value: string): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    throw new Error("Invalid Base32 secret.");
  }
  if (!BASE32_SAFE_PATTERN.test(normalized)) {
    throw new Error("Invalid Base32 secret.");
  }

  const firstPaddingIndex = normalized.indexOf("=");
  if (firstPaddingIndex !== -1) {
    const padding = normalized.slice(firstPaddingIndex);
    if (!/^=+$/.test(padding) || normalized.length % 8 !== 0) {
      throw new Error("Invalid Base32 secret.");
    }
  }

  const unpadded = normalized.replace(/=+$/g, "");
  if (!BASE32_VALID_UNPADDED_REMAINDERS.has(unpadded.length % 8)) {
    throw new Error("Invalid Base32 secret.");
  }

  return unpadded;
}

function base32Decode(value: string) {
  const normalized = normalizeStrictBase32(value);

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

function getTwoFactorCipherKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function getTwoFactorEncryptionCipherKey() {
  const encryptionSecret = getTwoFactorEncryptionSecret();
  if (!encryptionSecret) {
    throw new Error("TWO_FACTOR_ENCRYPTION_KEY is required to encrypt two-factor secrets.");
  }
  return getTwoFactorCipherKey(encryptionSecret);
}

function getTwoFactorDecryptionCipherKeys() {
  return getTwoFactorDecryptionSecrets().map((secret) => getTwoFactorCipherKey(secret));
}

export function resolveTotpAlgorithm(value?: string | null): TotpAlgorithm {
  return String(value || "").trim().toUpperCase() === "SHA1" ? "sha1" : "sha256";
}

function generateTotpAt(secret: string, timestampMs: number, algorithm = getTwoFactorTotpAlgorithm()) {
  const key = base32Decode(secret);
  const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(algorithm, key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (
    ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff)
  ) % (10 ** TOTP_DIGITS);
  return String(binary).padStart(TOTP_DIGITS, "0");
}

function isTotpCodeMatch(candidate: string, code: string) {
  if (!/^\d{6}$/.test(candidate) || !/^\d{6}$/.test(code)) {
    return false;
  }

  const candidateBuffer = Buffer.from(candidate, "utf8");
  const codeBuffer = Buffer.from(code, "utf8");
  return candidateBuffer.length === codeBuffer.length && timingSafeEqual(candidateBuffer, codeBuffer);
}

export function generateTwoFactorSecret() {
  return base32Encode(randomBytes(20));
}

export function normalizeTwoFactorCode(value: string): string | null {
  const normalized = String(value || "").replace(/[\s-]/g, "");
  return /^\d{6}$/.test(normalized) ? normalized : null;
}

export function verifyTwoFactorCode(
  secret: string,
  rawCode: string,
  window = 1,
  algorithm = getTwoFactorTotpAlgorithm(),
  metrics: Pick<InternalMetricsRecorder, "increment"> = internalMetrics,
) {
  const resolvedAlgorithm = resolveTotpAlgorithm(algorithm);
  const code = normalizeTwoFactorCode(rawCode);
  if (!code) {
    return false;
  }

  const now = Date.now();
  try {
    for (let step = -window; step <= window; step += 1) {
      const candidate = generateTotpAt(secret, now + step * TOTP_PERIOD_SECONDS * 1000, resolvedAlgorithm);
      if (isTotpCodeMatch(candidate, code)) {
        if (resolvedAlgorithm === "sha1") {
          metrics.increment("twoFactorTotpSha1VerificationSuccessTotal");
        }
        return true;
      }
    }
  } catch {
    metrics.increment("twoFactorInvalidBase32SecretTotal");
    return false;
  }

  return false;
}

export function generateCurrentTwoFactorCode(secret: string, algorithm = getTwoFactorTotpAlgorithm()) {
  return generateTotpAt(secret, Date.now(), algorithm);
}

function parseEncryptedTwoFactorSecretPayload(payload: string): {
  algorithm: TotpAlgorithm;
  ciphertextRaw: string;
  ivRaw: string;
  tagRaw: string;
} {
  const parts = String(payload || "").split(".");
  if (parts.length === 5 && parts[0] === "v2") {
    const algorithm = resolveTotpAlgorithm(parts[1]);
    const [, , ivRaw, ciphertextRaw, tagRaw] = parts;
    return {
      algorithm,
      ciphertextRaw,
      ivRaw,
      tagRaw,
    };
  }

  const [ivRaw, ciphertextRaw, tagRaw] = parts;
  return {
    algorithm: "sha1",
    ciphertextRaw,
    ivRaw,
    tagRaw,
  };
}

export function encryptTwoFactorSecret(
  secret: string,
  algorithm = getTwoFactorTotpAlgorithm(),
) {
  const resolvedAlgorithm = resolveTotpAlgorithm(algorithm);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getTwoFactorEncryptionCipherKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2.${resolvedAlgorithm}.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptTwoFactorSecretPayload(payload: string): DecryptedTwoFactorSecretPayload {
  const {
    algorithm,
    ciphertextRaw,
    ivRaw,
    tagRaw,
  } = parseEncryptedTwoFactorSecretPayload(payload);
  if (!ivRaw || !ciphertextRaw || !tagRaw) {
    throw new Error("Invalid 2FA secret payload.");
  }

  const iv = Buffer.from(ivRaw, "base64url");
  const ciphertext = Buffer.from(ciphertextRaw, "base64url");
  const tag = Buffer.from(tagRaw, "base64url");

  for (const cipherKey of getTwoFactorDecryptionCipherKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", cipherKey, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return {
        algorithm,
        secret: plaintext.toString("utf8"),
      };
    } catch {
      continue;
    }
  }

  throw new Error("Invalid 2FA secret payload.");
}

export function decryptTwoFactorSecret(payload: string) {
  return decryptTwoFactorSecretPayload(payload).secret;
}

export function buildTwoFactorOtpAuthUrl(params: {
  algorithm?: string | null | undefined;
  issuer: string;
  username: string;
  secret: string;
}) {
  const issuer = String(params.issuer || "SQR").trim() || "SQR";
  const username = String(params.username || "").trim();
  const label = encodeURIComponent(`${issuer}:${username}`);
  const encodedIssuer = encodeURIComponent(issuer);
  const secret = encodeURIComponent(params.secret);
  const algorithm = resolveTotpAlgorithm(params.algorithm ?? getTwoFactorTotpAlgorithm()).toUpperCase();
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=${algorithm}&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}
