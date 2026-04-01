import type {
  ManagedAccountActivationDelivery,
  ManagedAccountPasswordResetDelivery,
} from "./auth-account-types";

export function hasManagedAccountsQueryFilters(
  query: Record<string, unknown>,
  fields: string[],
) {
  return fields.some((field) => query[field] !== undefined);
}

export function buildManagedActivationDeliveryResponse(
  delivery: ManagedAccountActivationDelivery,
): ManagedAccountActivationDelivery {
  return {
    deliveryMode: delivery.deliveryMode,
    errorCode: delivery.errorCode,
    errorMessage: delivery.errorMessage,
    expiresAt: delivery.expiresAt,
    previewUrl: delivery.previewUrl,
    recipientEmail: delivery.recipientEmail,
    sent: delivery.sent,
  };
}

export function buildAccountDeletedAuditDetails(params: {
  target: { role: string; status: string; isBanned: boolean | null | undefined };
}) {
  return JSON.stringify({
    metadata: {
      deleted_role: params.target.role,
      deleted_status: params.target.status,
      was_banned: Boolean(params.target.isBanned),
    },
  });
}

export function buildAccountCreatedAuditDetails(params: {
  actorUsername: string;
  user: { role: string; status: string };
}) {
  return JSON.stringify({
    metadata: {
      role: params.user.role,
      status: params.user.status,
      created_by: params.actorUsername,
    },
  });
}

export function buildAccountUpdatedAuditDetails(params: {
  usernameChanged: boolean;
  emailChanged: boolean;
  fullNameChanged: boolean;
}) {
  return JSON.stringify({
    metadata: {
      username_changed: params.usernameChanged,
      email_changed: params.emailChanged,
      full_name_changed: params.fullNameChanged,
    },
  });
}

export function buildRoleChangedAuditDetails(params: {
  previousRole: string;
  nextRole: string;
}) {
  return JSON.stringify({
    metadata: {
      previous_role: params.previousRole,
      next_role: params.nextRole,
    },
  });
}

export function buildAccountStatusChangedAuditDetails(params: {
  previousStatus: string;
  nextStatus: string;
}) {
  return JSON.stringify({
    metadata: {
      previous_status: params.previousStatus,
      next_status: params.nextStatus,
    },
  });
}

export function buildPasswordResetSendFailedAuditDetails(params: {
  recipientEmail: string;
  reset: { expiresAt: Date };
  delivery: ManagedAccountPasswordResetDelivery;
}) {
  return JSON.stringify({
    metadata: {
      reset_type: "email_link",
      delivery: "email",
      delivery_mode: params.delivery.deliveryMode,
      recipient_email: params.recipientEmail,
      expires_at: params.reset.expiresAt.toISOString(),
      mail_error_code: params.delivery.errorCode,
    },
  });
}

export function buildPasswordResetApprovedAuditDetails(params: {
  recipientEmail: string;
  reset: { expiresAt: Date };
  delivery: ManagedAccountPasswordResetDelivery;
  targetLockedAt: Date | string | null | undefined;
}) {
  return JSON.stringify({
    metadata: {
      reset_type: "email_link",
      delivery: "email",
      delivery_mode: params.delivery.deliveryMode,
      recipient_email: params.recipientEmail,
      expires_at: params.reset.expiresAt.toISOString(),
      must_change_password: true,
      lock_cleared: Boolean(params.targetLockedAt),
    },
  });
}
