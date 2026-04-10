import nodemailer from "nodemailer";
import { runtimeConfig } from "../config/runtime";
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
