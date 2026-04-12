export type CreateActivationTokenParams = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdBy: string;
};

export type ConsumeActivationTokenParams = {
  tokenId: string;
  now?: Date;
};

export type CreatePasswordResetRequestParams = {
  userId: string;
  requestedByUser: string | null;
  approvedBy?: string | null | undefined;
  resetType?: string | undefined;
  tokenHash?: string | null | undefined;
  expiresAt?: Date | null | undefined;
  usedAt?: Date | null | undefined;
};

export type UpdatePasswordResetRequestParams = {
  requestId: string;
  approvedBy?: string | null | undefined;
  resetType?: string | undefined;
  usedAt?: Date | null | undefined;
  tokenHash?: string | null | undefined;
  expiresAt?: Date | null | undefined;
};

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
