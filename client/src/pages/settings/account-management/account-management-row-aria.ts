import type {
  DevMailOutboxPreview,
  ManagedUser,
  PendingPasswordResetRequest,
} from "@/pages/settings/types";

type ManagedAccountRowAriaOptions = {
  formattedLastLoginAt: string;
  formattedLockedAt: string | null;
  user: ManagedUser;
};

type PendingPasswordResetRowAriaOptions = {
  formattedCreatedAt: string;
  request: PendingPasswordResetRequest;
};

type LocalMailOutboxRowAriaOptions = {
  entry: DevMailOutboxPreview;
  formattedCreatedAt: string;
};

export function buildManagedAccountRowAriaLabel({
  formattedLastLoginAt,
  formattedLockedAt,
  user,
}: ManagedAccountRowAriaOptions) {
  const details: string[] = [
    `Managed account ${user.username}`,
    `role ${user.role}`,
    `status ${user.isBanned ? "banned" : user.status}`,
    `last login ${formattedLastLoginAt}`,
  ];

  const profileLabel = user.fullName || user.email;
  if (profileLabel) {
    details.splice(1, 0, `profile ${profileLabel}`);
  }
  if (formattedLockedAt) {
    details.push(`locked ${formattedLockedAt}`);
  }
  if (user.mustChangePassword) {
    details.push("password change required");
  }

  return details.join(", ");
}

export function buildPendingPasswordResetRowAriaLabel({
  formattedCreatedAt,
  request,
}: PendingPasswordResetRowAriaOptions) {
  const details: string[] = [
    `Pending password reset for ${request.username}`,
    `status ${request.isBanned ? "banned" : request.status}`,
    `requested by ${request.requestedByUser || "unknown"}`,
    `created ${formattedCreatedAt}`,
  ];

  const profileLabel = request.fullName || request.email;
  if (profileLabel) {
    details.splice(1, 0, `profile ${profileLabel}`);
  }

  return details.join(", ");
}

export function buildLocalMailOutboxRowAriaLabel({
  entry,
  formattedCreatedAt,
}: LocalMailOutboxRowAriaOptions) {
  return [
    `Mail preview to ${entry.to}`,
    `subject ${entry.subject}`,
    `created ${formattedCreatedAt}`,
  ].join(", ");
}
