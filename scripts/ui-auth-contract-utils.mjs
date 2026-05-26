import "dotenv/config";
import { createDecipheriv, createHash, createHmac } from "node:crypto";
import { Client } from "pg";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_PERIOD_MS = TOTP_PERIOD_SECONDS * 1000;
const CONTRACT_LOGIN_MAX_ATTEMPTS = 4;
const CONTRACT_LOGIN_RATE_LIMIT_FALLBACK_MS = 1_000;
const CONTRACT_LOGIN_RATE_LIMIT_MAX_WAIT_MS = 15_000;

const formatContractCleanupError = (error) => (error instanceof Error ? error.message : String(error));

const waitForVisible = async (locator, timeout = 10_000) => {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
};

export const probeAuthSession = async (page) =>
  page.evaluate(async () => {
    const response = await fetch("/api/me", { credentials: "include" });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      hasUser: Boolean(payload?.user),
      message: payload?.message || null,
    };
  });

const readResponseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const resolveRateLimitRecoveryMs = (response, payload) => {
  const headerSeconds = Number.parseFloat(response.headers()["retry-after"] || "");
  if (Number.isFinite(headerSeconds) && headerSeconds > 0) {
    return Math.min(
      CONTRACT_LOGIN_RATE_LIMIT_MAX_WAIT_MS,
      Math.max(CONTRACT_LOGIN_RATE_LIMIT_FALLBACK_MS, Math.ceil(headerSeconds * 1000)),
    );
  }

  const payloadRetryMs = Number(payload?.retryAfterMs);
  if (Number.isFinite(payloadRetryMs) && payloadRetryMs > 0) {
    return Math.min(
      CONTRACT_LOGIN_RATE_LIMIT_MAX_WAIT_MS,
      Math.max(CONTRACT_LOGIN_RATE_LIMIT_FALLBACK_MS, Math.ceil(payloadRetryMs)),
    );
  }

  return CONTRACT_LOGIN_RATE_LIMIT_FALLBACK_MS;
};

export const submitPasswordLoginWithRetry = async (page, {
  contextLabel,
  password,
  username,
  maxAttempts = CONTRACT_LOGIN_MAX_ATTEMPTS,
}) => {
  let lastLoginPayload = null;
  let lastLoginResponse = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST"
        && response.url().includes("/api/auth/login"),
      { timeout: 15_000 },
    );

    await page.getByTestId("input-username").fill(username);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("button-login").click();
    lastLoginResponse = await loginResponsePromise;
    await page.waitForTimeout(250);
    lastLoginPayload = await readResponseJson(lastLoginResponse);

    if (lastLoginResponse.status() !== 429 || attempt >= maxAttempts) {
      break;
    }

    const waitMs = resolveRateLimitRecoveryMs(lastLoginResponse, lastLoginPayload);
    const retryLabel = /\blogin\b/i.test(contextLabel) ? contextLabel : `${contextLabel} login`;
    console.warn(
      `${retryLabel} was rate limited; retrying after ${waitMs}ms `
      + `(attempt ${attempt}/${maxAttempts}).`,
    );
    await page.waitForTimeout(waitMs);
  }

  if (!lastLoginResponse) {
    throw new Error(`${contextLabel} could not observe the login response.`);
  }

  return {
    loginPayload: lastLoginPayload,
    loginResponse: lastLoginResponse,
  };
};

export const ensureLoginPageVisible = async (page, contextLabel = "Authenticated contract") => {
  const loginHeading = page.getByRole("heading", {
    name: /^(Log Masuk SQR|Log In SQR System)$/,
    level: 1,
  });
  const usernameInput = page.getByTestId("input-username");

  if (await waitForVisible(usernameInput)) {
    return;
  }

  if (await waitForVisible(loginHeading)) {
    await usernameInput.waitFor({ state: "visible", timeout: 10_000 });
    return;
  }

  const publicLoginButton = page.getByRole("button", { name: /^Log In$/ }).first();
  if (await waitForVisible(publicLoginButton, 2_000)) {
    await publicLoginButton.click();
    await page.waitForLoadState("networkidle");
    await usernameInput.waitFor({ state: "visible", timeout: 10_000 });
    await loginHeading.waitFor({ state: "visible", timeout: 10_000 });
    return;
  }

  const bodyText = await page.locator("body").innerText().catch(() => "(unavailable)");
  throw new Error(
    `${contextLabel} login page was not reachable after navigation. Visible body excerpt: ${bodyText.slice(0, 400)}`,
  );
};

export const waitForAuthenticatedShell = async (page, contextLabel = "Authenticated contract") => {
  const shellReady = await page.waitForFunction(
    () => {
      const isVisible = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) {
          return false;
        }

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none"
          && style.visibility !== "hidden"
          && rect.width > 0
          && rect.height > 0;
      };

      return isVisible('[data-testid="button-user-menu"]')
        || isVisible('[data-testid="button-user-menu-mobile"]')
        || isVisible('[data-testid="button-open-mobile-nav"]');
    },
    { timeout: 15_000 },
  ).catch(() => null);

  if (shellReady) {
    return;
  }

  const bodyText = await page.locator("body").innerText().catch(() => "(unavailable)");
  throw new Error(
    `${contextLabel} did not render the authenticated shell. Visible body excerpt: ${bodyText.slice(0, 400)}`,
  );
};

function base32Decode(value) {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[^A-Z2-7]/g, "");

  let bits = 0;
  let current = 0;
  const output = [];

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
  ) % 1_000_000;
  return String(binary).padStart(6, "0");
}

function getTwoFactorCipherKey(secret) {
  return createHash("sha256").update(secret).digest();
}

function getTwoFactorDecryptionSecrets() {
  const currentSecret = String(process.env.TWO_FACTOR_ENCRYPTION_KEY || "").trim();
  const previousSecrets = String(process.env.TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [currentSecret, ...previousSecrets].filter(Boolean);
}

function decryptTwoFactorSecret(payload) {
  const secrets = getTwoFactorDecryptionSecrets();
  if (secrets.length === 0) {
    throw new Error(
      "TWO_FACTOR_ENCRYPTION_KEY is required for authenticated contract automation when 2FA is enabled.",
    );
  }

  const [ivRaw, ciphertextRaw, tagRaw] = String(payload || "").split(".");
  if (!ivRaw || !ciphertextRaw || !tagRaw) {
    throw new Error("Invalid 2FA secret payload.");
  }

  const iv = Buffer.from(ivRaw, "base64url");
  const ciphertext = Buffer.from(ciphertextRaw, "base64url");
  const tag = Buffer.from(tagRaw, "base64url");

  for (const secret of secrets) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", getTwoFactorCipherKey(secret), iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext.toString("utf8");
    } catch {
      continue;
    }
  }

  throw new Error("Invalid 2FA secret payload.");
}

function buildPostgresConfig() {
  const connectionString = String(process.env.DATABASE_URL || "").trim();
  if (connectionString) {
    return { connectionString };
  }

  return {
    host: String(process.env.PG_HOST || "127.0.0.1"),
    port: Number.parseInt(String(process.env.PG_PORT || "5432"), 10) || 5432,
    user: String(process.env.PG_USER || "postgres"),
    password: String(process.env.PG_PASSWORD || ""),
    database: String(process.env.PG_DATABASE || "sqr_db"),
  };
}

async function readEncryptedTwoFactorSecret(username) {
  const client = new Client(buildPostgresConfig());
  await client.connect();
  try {
    const result = await client.query(
      `
        SELECT two_factor_enabled, two_factor_secret_encrypted
        FROM users
        WHERE lower(username) = lower($1)
        LIMIT 1
      `,
      [String(username || "").trim()],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`User "${String(username || "").trim()}" was not found for automated 2FA login.`);
    }

    if (row.two_factor_enabled !== true || !String(row.two_factor_secret_encrypted || "").trim()) {
      return null;
    }

    return String(row.two_factor_secret_encrypted).trim();
  } finally {
    await client.end().catch((error) => {
      console.warn(`Authenticated contract PostgreSQL client cleanup failed: ${formatContractCleanupError(error)}`);
    });
  }
}

async function resolveCurrentTwoFactorCode(username) {
  const encryptedSecret = await readEncryptedTwoFactorSecret(username);
  if (!encryptedSecret) {
    throw new Error(
      `User "${String(username || "").trim()}" does not have an active encrypted 2FA secret for authenticated contract automation.`,
    );
  }

  const decryptedSecret = decryptTwoFactorSecret(encryptedSecret);
  return generateTotpAt(decryptedSecret, Date.now());
}

function getWaitUntilNextTotpWindowMs(nowMs = Date.now()) {
  const remainder = nowMs % TOTP_PERIOD_MS;
  const remaining = remainder === 0 ? TOTP_PERIOD_MS : TOTP_PERIOD_MS - remainder;
  return Math.max(750, remaining + 250);
}

export async function completeTwoFactorLoginIfNeeded(page, {
  loginPayload,
  username,
  contextLabel,
}) {
  if (!loginPayload || loginPayload.twoFactorRequired !== true) {
    return null;
  }

  const challengeToken = String(loginPayload.challengeToken || "").trim();
  if (!challengeToken) {
    throw new Error(`${contextLabel} returned twoFactorRequired without a challengeToken.`);
  }

  const normalizedUsername = String(loginPayload.username || username || "").trim();
  let lastVerifyPayload = null;
  let lastVerifyResponse = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByTestId("input-two-factor-code").waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="button-login"]');
        return button instanceof HTMLButtonElement
          && button.disabled === false
          && /sahkan kod/i.test(button.innerText || "");
      },
      { timeout: 10_000 },
    );

    const verifyResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST"
        && response.url().includes("/api/auth/verify-two-factor-login"),
      { timeout: 15_000 },
    );

    const currentCode = await resolveCurrentTwoFactorCode(normalizedUsername);
    await page.getByTestId("input-two-factor-code").fill(currentCode);
    await page.getByTestId("button-login").click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(250);

    lastVerifyResponse = await verifyResponsePromise;
    try {
      lastVerifyPayload = await lastVerifyResponse.json();
    } catch {
      lastVerifyPayload = null;
    }

    if (lastVerifyResponse.ok()) {
      break;
    }

    if (attempt === 0 && lastVerifyResponse.status() === 401) {
      await page.waitForTimeout(getWaitUntilNextTotpWindowMs());
      continue;
    }

    break;
  }

  if (!lastVerifyResponse) {
    throw new Error(`${contextLabel} could not observe the two-factor verification response.`);
  }

  return {
    verifyPayload: lastVerifyPayload,
    verifyResponse: lastVerifyResponse,
  };
}
