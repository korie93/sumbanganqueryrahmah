import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function requireGithubEnvPath() {
  const githubEnvPath = String(process.env.GITHUB_ENV || "").trim();
  if (!githubEnvPath) {
    throw new Error("GITHUB_ENV is required for CI runtime secret generation.");
  }

  return githubEnvPath;
}

function randomBase64Url(byteLength) {
  return randomBytes(byteLength).toString("base64url");
}

function randomBase32(byteLength) {
  const buffer = randomBytes(byteLength);
  let bitCount = 0;
  let accumulator = 0;
  let output = "";

  for (const byte of buffer) {
    accumulator = (accumulator << 8) | byte;
    bitCount += 8;

    while (bitCount >= 5) {
      output += BASE32_ALPHABET[(accumulator >>> (bitCount - 5)) & 31];
      bitCount -= 5;
    }
  }

  if (bitCount > 0) {
    output += BASE32_ALPHABET[(accumulator << (5 - bitCount)) & 31];
  }

  return output;
}

function writeGithubEnv(entries) {
  const githubEnvPath = requireGithubEnvPath();
  const serializedEntries = [];

  for (const [key, value] of Object.entries(entries)) {
    console.log(`::add-mask::${value}`);
    serializedEntries.push(`${key}=${value}`);
  }

  appendFileSync(githubEnvPath, `${serializedEntries.join("\n")}\n`, "utf8");
}

const identitySuffix = randomBytes(6).toString("hex");
const sharedPassword = randomBase64Url(24);
const sharedTotpSecret = randomBase32(20);
const username = `superuser-ci-${identitySuffix}`;

writeGithubEnv({
  PG_PASSWORD: randomBase64Url(24),
  SESSION_SECRET: randomBase64Url(48),
  TWO_FACTOR_ENCRYPTION_KEY: randomBase64Url(48),
  SEED_SUPERUSER_USERNAME: username,
  SEED_SUPERUSER_PASSWORD: sharedPassword,
  SEED_SUPERUSER_TWO_FACTOR_SECRET: sharedTotpSecret,
  SMOKE_TEST_USERNAME: username,
  SMOKE_TEST_PASSWORD: sharedPassword,
  SMOKE_TEST_TWO_FACTOR_SECRET: sharedTotpSecret,
});
