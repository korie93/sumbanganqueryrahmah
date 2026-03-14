import nodemailer from "nodemailer";
import { isDevMailOutboxEnabled, writeDevMailPreview } from "./dev-mail-outbox";

type MailTransportConfig = {
  from: string;
  host?: string;
  password?: string;
  port?: number;
  requireTls: boolean;
  secure: boolean;
  service?: string;
  user?: string;
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

function readMailEnv(name: string): string | null {
  const raw = String(process.env[name] || "").trim();
  return raw ? raw : null;
}

function parseBooleanFlag(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function readTransportConfig(): MailTransportConfig | null {
  if (cachedTransportConfig) return cachedTransportConfig;

  const service = readMailEnv("SMTP_SERVICE");
  const host = readMailEnv("SMTP_HOST");
  const portRaw = readMailEnv("SMTP_PORT");
  const user = readMailEnv("SMTP_USER") || undefined;
  const password = readMailEnv("SMTP_PASSWORD") || undefined;
  const from = readMailEnv("MAIL_FROM") || user || null;
  if (!from) {
    return null;
  }

  if (service) {
    if (!user || !password) {
      return null;
    }

    cachedTransportConfig = {
      from,
      password,
      requireTls: parseBooleanFlag(readMailEnv("SMTP_REQUIRE_TLS"), false),
      secure: parseBooleanFlag(readMailEnv("SMTP_SECURE"), false),
      service: service.trim(),
      user,
    };

    return cachedTransportConfig;
  }

  if (!host) {
    return null;
  }

  if (user && !password) {
    return null;
  }

  const port = Number(portRaw || "587");
  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }

  const secure = parseBooleanFlag(readMailEnv("SMTP_SECURE"), port === 465);
  const requireTls = parseBooleanFlag(readMailEnv("SMTP_REQUIRE_TLS"), false);

  cachedTransportConfig = {
    from,
    host,
    password,
    port,
    requireTls,
    secure,
    user,
  };

  return cachedTransportConfig;
}

function getTransporter(config: MailTransportConfig): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    service: config.service,
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTls,
    auth: config.user
      ? {
          user: config.user,
          pass: config.password || "",
        }
      : undefined,
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
      return {
        deliveryMode: "dev_outbox",
        errorCode: null,
        errorMessage: null,
        messageId: preview.messageId,
        previewUrl: preview.previewUrl,
        sent: true,
      };
    }

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

    return {
      deliveryMode: "smtp",
      errorCode: null,
      errorMessage: null,
      messageId: String(info.messageId || "") || null,
      previewUrl: nodemailer.getTestMessageUrl(info) || null,
      sent: true,
    };
  } catch (error) {
    if (isDevMailOutboxEnabled()) {
      const preview = await writeDevMailPreview(input);
      return {
        deliveryMode: "dev_outbox",
        errorCode: null,
        errorMessage: null,
        messageId: preview.messageId,
        previewUrl: preview.previewUrl,
        sent: true,
      };
    }

    return {
      deliveryMode: "none",
      errorCode: "MAIL_SEND_FAILED",
      errorMessage: error instanceof Error ? error.message : "Failed to send email.",
      messageId: null,
      previewUrl: null,
      sent: false,
    };
  }
}
