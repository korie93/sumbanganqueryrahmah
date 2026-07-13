import { randomBytes } from "node:crypto";

export const SMOKE_SESSION_SECRET_MIN_BYTES = 32;

export function resolveSmokeSessionSecret(
  configuredValue,
  generateSecret = () => randomBytes(SMOKE_SESSION_SECRET_MIN_BYTES).toString("base64url"),
) {
  const configuredSecret = String(configuredValue || "").trim();
  if (Buffer.byteLength(configuredSecret, "utf8") >= SMOKE_SESSION_SECRET_MIN_BYTES) {
    return configuredSecret;
  }

  const generatedSecret = String(generateSecret()).trim();
  if (Buffer.byteLength(generatedSecret, "utf8") < SMOKE_SESSION_SECRET_MIN_BYTES) {
    throw new Error(
      `Generated smoke SESSION_SECRET must be at least ${SMOKE_SESSION_SECRET_MIN_BYTES} bytes.`,
    );
  }

  return generatedSecret;
}
