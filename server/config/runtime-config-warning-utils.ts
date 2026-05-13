import { buildTwoFactorReplayCacheTopologyWarning } from "../auth/two-factor-replay-topology";
import { buildWebSocketTopologyWarning } from "../ws/websocket-topology";
import type { MailConfigurationAssessment, RuntimeConfigDiagnostic } from "./runtime-config-types";

export function buildRuntimeConfigWarnings(params: {
  isStrictLocalDevelopment: boolean;
  isProductionLike: boolean;
  publicAppUrl: string | null;
  configuredSessionSecret: string | null;
  configuredCollectionNicknameTempPassword: string | null;
  configuredCollectionPiiEncryptionKey: string | null;
  configuredPgPassword: string | null;
  configuredAuthCookieSecure: string | null;
  configuredClusterMaxWorkers: number;
  mailConfiguration: MailConfigurationAssessment;
}): RuntimeConfigDiagnostic[] {
  const warnings: RuntimeConfigDiagnostic[] = [];
  const {
    isStrictLocalDevelopment,
    isProductionLike,
    publicAppUrl,
    configuredSessionSecret,
    configuredCollectionNicknameTempPassword,
    configuredCollectionPiiEncryptionKey,
    configuredPgPassword,
    configuredAuthCookieSecure,
    configuredClusterMaxWorkers,
    mailConfiguration,
  } = params;

  if (!publicAppUrl) {
    warnings.push({
      code: "PUBLIC_APP_URL_MISSING",
      envNames: ["PUBLIC_APP_URL"],
      message: "PUBLIC_APP_URL is not set; generated links and deployment health checks may be less reliable.",
      severity: "warning",
    });
  }

  if (isStrictLocalDevelopment && !configuredPgPassword) {
    warnings.push({
      code: "PG_PASSWORD_EMPTY_LOCAL",
      envNames: ["PG_PASSWORD"],
      message: "PG_PASSWORD is empty in strict local development. This is allowed locally but will fail against password-protected PostgreSQL servers.",
      severity: "warning",
    });
  }

  if (isStrictLocalDevelopment && !configuredSessionSecret) {
    warnings.push({
      code: "SESSION_SECRET_EPHEMERAL_LOCAL",
      envNames: ["SESSION_SECRET"],
      message: "SESSION_SECRET is not set, so a temporary in-memory secret will be generated on each boot.",
      severity: "warning",
    });
  }

  if (isStrictLocalDevelopment && !configuredCollectionNicknameTempPassword) {
    warnings.push({
      code: "COLLECTION_TEMP_PASSWORD_EPHEMERAL_LOCAL",
      envNames: ["COLLECTION_NICKNAME_TEMP_PASSWORD"],
      message: "COLLECTION_NICKNAME_TEMP_PASSWORD is not set, so a temporary value will be generated on each boot.",
      severity: "warning",
    });
  }

  if (isStrictLocalDevelopment && !configuredCollectionPiiEncryptionKey) {
    warnings.push({
      code: "COLLECTION_PII_ENCRYPTION_KEY_EMPTY_LOCAL",
      envNames: ["COLLECTION_PII_ENCRYPTION_KEY"],
      message: "COLLECTION_PII_ENCRYPTION_KEY is not set, so collection PII shadow columns stay plaintext-only in strict local development.",
      severity: "warning",
    });
  }

  if (mailConfiguration.isIncomplete) {
    warnings.push({
      code: "MAIL_CONFIGURATION_INCOMPLETE",
      envNames: ["MAIL_FROM", "SMTP_SERVICE", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"],
      message: isStrictLocalDevelopment
        ? "Mail delivery env vars are partially configured. Email delivery will stay disabled until the SMTP env vars are completed."
        : "Mail delivery env vars are partially configured.",
      severity: "warning",
    });
  }

  if (!isStrictLocalDevelopment && !mailConfiguration.hasAnyInput) {
    warnings.push({
      code: "MAIL_CONFIGURATION_MISSING",
      envNames: ["MAIL_FROM", "SMTP_SERVICE", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"],
      message:
        "SMTP mail configuration is not set. Activation and password-reset emails will not be delivered until MAIL_FROM/SMTP_* are configured.",
      severity: "warning",
    });
  }

  if (isProductionLike && /^(?:0|false)$/i.test(String(configuredAuthCookieSecure || "").trim())) {
    warnings.push({
      code: "AUTH_COOKIE_SECURE_FORCED_ON_PRODUCTION",
      envNames: ["AUTH_COOKIE_SECURE"],
      message: "AUTH_COOKIE_SECURE=false was ignored because secure auth cookies are mandatory on production-like hosts.",
      severity: "warning",
    });
  }

  const twoFactorReplayCacheTopologyWarning = buildTwoFactorReplayCacheTopologyWarning(
    configuredClusterMaxWorkers,
  );
  if (twoFactorReplayCacheTopologyWarning) {
    warnings.push({
      code: "TWO_FACTOR_REPLAY_CACHE_PROCESS_LOCAL",
      envNames: ["SQR_MAX_WORKERS"],
      message: twoFactorReplayCacheTopologyWarning,
      severity: "warning",
    });
  }

  const websocketTopologyWarning = buildWebSocketTopologyWarning(configuredClusterMaxWorkers);
  if (websocketTopologyWarning) {
    warnings.push({
      code: "WEBSOCKET_STATE_PROCESS_LOCAL",
      envNames: ["SQR_MAX_WORKERS"],
      message: websocketTopologyWarning,
      severity: "warning",
    });
  }

  return warnings;
}
