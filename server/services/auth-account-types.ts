export const ACTIVATION_TOKEN_TTL_HOURS = 24;
export const PASSWORD_RESET_TOKEN_TTL_HOURS = 4;

export type ManagedAccountActivationDelivery = {
  deliveryMode: "dev_outbox" | "none" | "smtp";
  errorCode: string | null;
  errorMessage: string | null;
  expiresAt: Date;
  previewUrl: string | null;
  recipientEmail: string;
  sent: boolean;
};

export type ActivationTokenValidationResult = {
  email: string | null;
  expiresAt: Date;
  fullName: string | null;
  role: string;
  username: string;
};

export type ManagedAccountPasswordResetDelivery = ManagedAccountActivationDelivery;

export type PasswordResetTokenValidationResult = {
  email: string | null;
  expiresAt: Date;
  fullName: string | null;
  role: string;
  username: string;
};

export class AuthAccountError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly extra?: Record<string, unknown> | undefined,
  ) {
    super(message);
    this.name = "AuthAccountError";
  }
}
