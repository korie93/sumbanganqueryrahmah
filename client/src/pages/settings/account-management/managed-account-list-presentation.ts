import type { ManagedUser } from "@/pages/settings/types";

export type ManagedAccountLoginAccess = {
  label: string;
  description: string;
  tone: "danger" | "warning" | "success" | "neutral";
};

/** Present the strongest current access restriction without changing account state. */
export function getManagedAccountLoginAccess(user: ManagedUser): ManagedAccountLoginAccess {
  if (user.isBanned || user.status === "banned") {
    return { label: "Banned", description: "Account banned", tone: "danger" };
  }
  if (user.status === "suspended") {
    return { label: "Suspended", description: "Login suspended", tone: "danger" };
  }
  if (user.status === "disabled") {
    return { label: "Disabled", description: "Account disabled", tone: "danger" };
  }
  if (user.lockedAt || user.status === "locked") {
    return {
      label: "Login locked",
      description: user.lockedReason || "Login locked by security controls",
      tone: "danger",
    };
  }
  if (user.mustChangePassword) {
    return { label: "Password change required", description: "Must change password at next login", tone: "warning" };
  }
  if (user.status === "pending_activation") {
    return { label: "Pending activation", description: "Account activation not completed", tone: "warning" };
  }
  if (user.status === "active") {
    return { label: "Active", description: "No current access restrictions", tone: "success" };
  }
  return {
    label: user.status || "Unknown status",
    description: "Review the account record for access details",
    tone: "neutral",
  };
}

export type ManagedAccountListAction = {
  id: "reset" | "resend" | "ban" | "delete";
  label: string;
  disabled: boolean;
  destructive?: boolean;
  description?: string;
  onSelect: () => void;
};

export type ManagedAccountListActionCallbacks = {
  onBanToggle: (user: ManagedUser) => void;
  onDelete: (user: ManagedUser) => void;
  onResetPassword: (user: ManagedUser) => void;
  onResendActivation: (user: ManagedUser) => void;
};

export function buildManagedAccountListActions({ user, deletingManagedUserId, ...callbacks }: ManagedAccountListActionCallbacks & {
  user: ManagedUser;
  deletingManagedUserId: string | null;
}): ManagedAccountListAction[] {
  // Keep the existing activation eligibility and delete-in-progress guards.
  const canResend = user.status === "pending_activation" && !user.isBanned;
  const deleting = deletingManagedUserId === user.id;
  return [
    { id: "reset", label: "Send Reset Email", disabled: false, onSelect: () => callbacks.onResetPassword(user) },
    {
      id: "resend", label: "Resend Activation", disabled: !canResend,
      description: canResend ? "Send another activation email" : "Available only for pending, non-banned accounts",
      onSelect: () => { if (canResend) callbacks.onResendActivation(user); },
    },
    { id: "ban", label: user.isBanned ? "Unban" : "Ban", disabled: false, onSelect: () => callbacks.onBanToggle(user) },
    {
      id: "delete", label: deleting ? "Deleting..." : "Delete", disabled: deleting, destructive: true,
      onSelect: () => { if (!deleting) callbacks.onDelete(user); },
    },
  ];
}
