export type CreateActivationTokenParams = {
  userId: string;
  expectedRecipientEmail: string;
  tokenHash: string;
  expiresAt: Date;
  createdBy: string;
};

export type ConsumeActivationTokenParams = {
  tokenId: string;
  now?: Date;
};

type PasswordResetRecipientParams =
  // Approval-only requests have no recipient or bearer token yet.
  | { tokenHash: string; expectedRecipientEmail: string }
  | { tokenHash?: null | undefined; expectedRecipientEmail?: never };

export type CreatePasswordResetRequestParams = {
  userId: string;
  requestedByUser: string | null;
  approvedBy?: string | null | undefined;
  resetType?: string | undefined;
  expiresAt?: Date | null | undefined;
  usedAt?: Date | null | undefined;
} & PasswordResetRecipientParams;

export type UpdatePasswordResetRequestParams = {
  requestId: string;
  approvedBy?: string | null | undefined;
  resetType?: string | undefined;
  usedAt?: Date | null | undefined;
  expiresAt?: Date | null | undefined;
} & PasswordResetRecipientParams;

export type ResolvePendingPasswordResetRequestsForUserParams = {
  userId: string;
  approvedBy: string;
  resetType: string;
  usedAt?: Date | null;
};

export type ConsumePasswordResetRequestParams = {
  requestId: string;
  now?: Date;
};
