import nodemailer from "nodemailer";
import { runtimeConfig } from "../config/runtime";
import { logger } from "../lib/logger";
import { isDevMailOutboxEnabled, writeDevMailPreview } from "./dev-mail-outbox";

type MailTransportConfig = {
  from: string;
  host?: string | undefined;
  password?: string | undefined;
  port?: number | undefined;
  requireTls: boolean;
  secure: boolean;
  service?: string | undefined;
  user?: string | undefined;
};

export type MailSendResult = {
  deliveryMode: "dev_outbox" | "none" | "smtp";
  errorCode: string | null;
  errorMessage: string | null;
  messageId: string | null;
  previewUrl: string | null;
  sent: boolean;
};

type SendMailInput = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

let cachedTransportConfig: MailTransportConfig | null = null;
let cachedTransporter: nodemailer.Transporter | null = null;

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readSendInfoRecord(info: unknown): Record<string, unknown> {
  return info && typeof info === "object" ? info as Record<string, unknown> : {};
}

export function resolveSmtpDeliveryOutcome(info: unknown): {
  errorCode: string | null;
  errorMessage: string | null;
  sent: boolean;
} {
  const record = readSendInfoRecord(info);
  const accepted = readStringArray(record.accepted);
  const pending = readStringArray(record.pending);
  const rejected = readStringArray(record.rejected);
  const responseCode = readFiniteNumber(record.responseCode);

  if (responseCode !== null && responseCode >= 400) {
    return {
      errorCode: "MAIL_SMTP_REJECTED",
      errorMessage: "SMTP server rejected the message.",
      sent: false,
    };
  }

  if (rejected.length > 0) {
    return {
      errorCode: "MAIL_RECIPIENT_REJECTED",
      errorMessage: "SMTP server rejected one or more recipients.",
      sent: false,
    };
  }

  if (Array.isArray(record.accepted) && accepted.length === 0 && pending.length === 0) {
    return {
      errorCode: "MAIL_NOT_ACCEPTED",
      errorMessage: "SMTP server did not accept the message for delivery.",
      sent: false,
    };
  }

  return {
    errorCode: null,
    errorMessage: null,
    sent: true,
  };
}

function getMailPurpose(subject: string): string {
  const normalized = subject.toLowerCase();
  if (normalized.includes("activation") || normalized.includes("activate")) return "account_activation";
  if (normalized.includes("reset")) return "password_reset";
  return "transactional";
}

function getRecipientDomain(to: string): string | null {
  const atIndex = to.lastIndexOf("@");
  if (atIndex < 0 || atIndex >= to.length - 1) return null;
  return to.slice(atIndex + 1).trim().toLowerCase() || null;
}

function getTransportLogMeta(config: MailTransportConfig | null, input: SendMailInput) {
  return {
    deliveryMode: config ? "smtp" : "none",
    mailPurpose: getMailPurpose(input.subject),
    recipientDomain: getRecipientDomain(input.to),
    smtpHostConfigured: Boolean(config?.host),
    smtpPort: config?.port ?? null,
    smtpRequireTls: config?.requireTls ?? null,
    smtpSecure: config?.secure ?? null,
    smtpServiceConfigured: Boolean(config?.service),
  };
}

function getMailErrorLogMeta(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") {
    return {
      errorName: typeof error,
    };
  }

  const record = error as Record<string, unknown>;
  return {
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorCode: typeof record.code === "string" ? record.code : null,
    responseCode: readFiniteNumber(record.responseCode),
    smtpCommand: typeof record.command === "string" ? record.command : null,
    smtpResponse: typeof record.response === "string" ? record.response : null,
  };
}

function readTransportConfig(): MailTransportConfig | null {
  if (cachedTransportConfig) return cachedTransportConfig;

  const {
    from,
    host,
    password,
    port,
    requireTls,
    secure,
    service,
    user,
  } = runtimeConfig.mail.transport;
  if (!from) {
    return null;
  }

  if (service) {
    if (!user || !password) {
      return null;
    }

    cachedTransportConfig = {
      from,
      password: password ?? undefined,
      requireTls,
      secure,
      service: service ?? undefined,
      user: user ?? undefined,
    };

    return cachedTransportConfig;
  }

  if (!host) {
    return null;
  }

  if (user && !password) {
    return null;
  }

  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }

  cachedTransportConfig = {
    from,
    host: host ?? undefined,
    password: password ?? undefined,
    port,
    requireTls,
    secure,
    user: user ?? undefined,
  };

  return cachedTransportConfig;
}

function getTransporter(config: MailTransportConfig): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;

  const auth = (() => {
    if (!config.user) {
      return undefined;
    }
    if (!config.password) {
      throw new Error("SMTP_PASSWORD is required when SMTP_USER is configured.");
    }
    return {
      user: config.user,
      pass: config.password,
    };
  })();

  cachedTransporter = nodemailer.createTransport({
    service: config.service,
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTls,
    auth,
  });

  return cachedTransporter;
}

export function isMailDeliveryConfigured(): boolean {
  return Boolean(readTransportConfig()) || isDevMailOutboxEnabled();
}

export async function sendMail(input: SendMailInput): Promise<MailSendResult> {
  const config = readTransportConfig();
  if (!config) {
    if (isDevMailOutboxEnabled()) {
      const preview = await writeDevMailPreview(input);
      logger.info("Mail delivery captured in local development outbox", {
        ...getTransportLogMeta(null, input),
        deliveryMode: "dev_outbox",
        messageId: preview.messageId,
      });
      return {
        deliveryMode: "dev_outbox",
        errorCode: null,
        errorMessage: null,
        messageId: preview.messageId,
        previewUrl: preview.previewUrl,
        sent: true,
      };
    }

    logger.warn("Mail delivery skipped because SMTP is not configured", getTransportLogMeta(null, input));
    return {
      deliveryMode: "none",
      errorCode: "MAILER_NOT_CONFIGURED",
      errorMessage: "SMTP transport is not configured.",
      messageId: null,
      previewUrl: null,
      sent: false,
    };
  }

  try {
    const transporter = getTransporter(config);
    const info = await transporter.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    const outcome = resolveSmtpDeliveryOutcome(info);
    const messageId = String(info.messageId || "") || null;
    const previewUrl = nodemailer.getTestMessageUrl(info) || null;

    if (!outcome.sent) {
      logger.warn("SMTP mail delivery was not accepted", {
        ...getTransportLogMeta(config, input),
        errorCode: outcome.errorCode,
        messageId,
      });

      return {
        deliveryMode: "smtp",
        errorCode: outcome.errorCode,
        errorMessage: outcome.errorMessage,
        messageId,
        previewUrl,
        sent: false,
      };
    }

    logger.info("SMTP mail delivery accepted", {
      ...getTransportLogMeta(config, input),
      messageId,
    });

    return {
      deliveryMode: "smtp",
      errorCode: null,
      errorMessage: null,
      messageId,
      previewUrl,
      sent: true,
    };
  } catch (error) {
    if (isDevMailOutboxEnabled()) {
      const preview = await writeDevMailPreview(input);
      logger.warn("SMTP mail delivery failed; captured fallback in local development outbox", {
        ...getTransportLogMeta(config, input),
        ...getMailErrorLogMeta(error),
        fallbackDeliveryMode: "dev_outbox",
        messageId: preview.messageId,
      });
      return {
        deliveryMode: "dev_outbox",
        errorCode: null,
        errorMessage: null,
        messageId: preview.messageId,
        previewUrl: preview.previewUrl,
        sent: true,
      };
    }

    logger.warn("SMTP mail delivery failed", {
      ...getTransportLogMeta(config, input),
      ...getMailErrorLogMeta(error),
    });
    return {
      deliveryMode: "smtp",
      errorCode: "MAIL_SEND_FAILED",
      errorMessage: error instanceof Error ? error.message : "Failed to send email.",
      messageId: null,
      previewUrl: null,
      sent: false,
    };
  }
}
