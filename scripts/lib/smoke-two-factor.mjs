import { createHmac } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

export const LOCAL_SMOKE_SUPERUSER_TWO_FACTOR_SECRET = "JBSWY3DPEHPK3PXP";
export const LOCAL_SMOKE_ADMIN_TWO_FACTOR_SECRET = "KRUGS4ZANFZSAYJA";

function base32Decode(value) {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/=+$/g, "")
    .trim();

  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    throw new Error("Invalid smoke 2FA secret.");
  }

  let bits = 0;
  let current = 0;
  const output = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      throw new Error("Invalid smoke 2FA secret.");
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

function generateTotpAt(secret, timestampMs) {
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

export async function generateCurrentSmokeTwoFactorCode(secret) {
  return generateTotpAt(secret, Date.now());
}

export function resolveSmokeTwoFactorSecret({ explicitSecret, role }) {
  const normalizedExplicitSecret = String(explicitSecret || "").trim();
  if (normalizedExplicitSecret) {
    return normalizedExplicitSecret;
  }

  if (role === "superuser") {
    return LOCAL_SMOKE_SUPERUSER_TWO_FACTOR_SECRET;
  }

  if (role === "admin") {
    return LOCAL_SMOKE_ADMIN_TWO_FACTOR_SECRET;
  }

  return null;
}

export async function performLoginWithOptionalTwoFactor(params) {
  const loginResponse = await params.request("/api/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: params.username,
      password: params.password,
      fingerprint: params.fingerprint,
      pcName: params.pcName,
      browser: params.browser,
    }),
  }, { allowFailure: true });

  if (loginResponse.status === 200 && loginResponse.json?.twoFactorRequired === true) {
    const challengeToken = String(loginResponse.json?.challengeToken || "").trim();
    if (!challengeToken) {
      throw new Error("Smoke login received a 2FA challenge without a challenge token.");
    }

    const secret = resolveSmokeTwoFactorSecret({
      explicitSecret: params.twoFactorSecret,
      role: String(loginResponse.json?.role || "").trim().toLowerCase(),
    });

    if (!secret) {
      throw new Error("Smoke login requires a 2FA secret, but none was configured for this role.");
    }

    const verifyResponse = await params.request("/api/auth/verify-two-factor-login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        challengeToken,
        code: await generateCurrentSmokeTwoFactorCode(secret),
      }),
    }, { allowFailure: true });

    return {
      challengeUsed: true,
      loginResponse,
      finalResponse: verifyResponse,
    };
  }

  return {
    challengeUsed: false,
    loginResponse,
    finalResponse: loginResponse,
  };
}
