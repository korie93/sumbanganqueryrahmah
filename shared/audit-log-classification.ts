export type AuditRiskLevel = "low" | "medium" | "high" | "critical";

export type AuditCategory =
  | "Audit"
  | "Backup"
  | "Collection"
  | "Import/Export"
  | "Security"
  | "Settings"
  | "System"
  | "User Management";

export const AUDIT_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

export const AUDIT_CATEGORIES = [
  "Audit",
  "Backup",
  "Collection",
  "Import/Export",
  "Security",
  "Settings",
  "System",
  "User Management",
] as const;

export interface AuditRiskInfo {
  level: AuditRiskLevel;
  label: "Low" | "Medium" | "High" | "Critical";
  description: string;
}

export interface AuditCategoryInfo {
  label: AuditCategory;
  description: string;
}

export function isAuditRiskLevel(value: string): value is AuditRiskLevel {
  return (AUDIT_RISK_LEVELS as readonly string[]).includes(value);
}

export function isAuditCategory(value: string): value is AuditCategory {
  return (AUDIT_CATEGORIES as readonly string[]).includes(value);
}

export const AUDIT_RISK_PATTERNS: Record<Exclude<AuditRiskLevel, "low">, readonly string[]> = {
  critical: [
    "CRITICAL",
    "RESTORE_BACKUP",
    "DELETE_BACKUP",
    "CLEANUP_AUDIT",
    "ROLE",
    "PERMISSION",
  ],
  high: [
    "BAN",
    "KICK",
    "BLOCKED",
    "FAILED",
    "DELETE",
    "PASSWORD",
    "LOCK",
    "REVOKE",
    "RESET",
  ],
  medium: [
    "CREATE_BACKUP",
    "IMPORT",
    "EXPORT",
    "UPDATE",
    "SETTING",
    "COLLECTION",
    "NICKNAME",
  ],
};

export const AUDIT_CATEGORY_PATTERNS: Record<Exclude<AuditCategory, "System">, readonly string[]> = {
  Audit: ["AUDIT"],
  Backup: ["BACKUP", "RESTORE"],
  Collection: ["COLLECTION", "RECORD"],
  "Import/Export": ["IMPORT", "EXPORT", "DOWNLOAD"],
  Security: ["LOGIN", "LOGOUT", "PASSWORD", "BAN", "KICK", "SESSION"],
  Settings: ["SETTING", "MAINTENANCE"],
  "User Management": ["USER", "ROLE", "ACCOUNT"],
};

function normalizedAction(action: string) {
  return action.trim().toUpperCase();
}

function actionIncludes(action: string, patterns: readonly string[]) {
  return patterns.some((pattern) => action.includes(pattern));
}

export function getAuditRiskInfo(action: string): AuditRiskInfo {
  const normalized = normalizedAction(action);

  if (actionIncludes(normalized, AUDIT_RISK_PATTERNS.critical)) {
    return {
      level: "critical",
      label: "Critical",
      description: "High-impact administrative or recovery action. Review carefully.",
    };
  }

  if (actionIncludes(normalized, AUDIT_RISK_PATTERNS.high)) {
    return {
      level: "high",
      label: "High",
      description: "Security-sensitive or destructive action that may need follow-up.",
    };
  }

  if (actionIncludes(normalized, AUDIT_RISK_PATTERNS.medium)) {
    return {
      level: "medium",
      label: "Medium",
      description: "Operational change that is useful for routine audit review.",
    };
  }

  return {
    level: "low",
    label: "Low",
    description: "Routine activity with low operational risk.",
  };
}

export function getAuditCategoryInfo(action: string): AuditCategoryInfo {
  const normalized = normalizedAction(action);

  if (actionIncludes(normalized, AUDIT_CATEGORY_PATTERNS.Backup)) {
    return { label: "Backup", description: "Backup, restore, or data recovery activity." };
  }
  if (actionIncludes(normalized, AUDIT_CATEGORY_PATTERNS.Collection)) {
    return { label: "Collection", description: "Collection record or collection setting activity." };
  }
  if (actionIncludes(normalized, AUDIT_CATEGORY_PATTERNS["Import/Export"])) {
    return { label: "Import/Export", description: "Data movement, import, export, or download activity." };
  }
  if (actionIncludes(normalized, AUDIT_CATEGORY_PATTERNS.Security)) {
    return { label: "Security", description: "Authentication, session, or security-control activity." };
  }
  if (actionIncludes(normalized, AUDIT_CATEGORY_PATTERNS.Settings)) {
    return { label: "Settings", description: "System configuration or maintenance setting activity." };
  }
  if (actionIncludes(normalized, AUDIT_CATEGORY_PATTERNS["User Management"])) {
    return { label: "User Management", description: "Account, role, or user administration activity." };
  }
  if (actionIncludes(normalized, AUDIT_CATEGORY_PATTERNS.Audit)) {
    return { label: "Audit", description: "Audit log review, retention, or cleanup activity." };
  }

  return { label: "System", description: "General system activity." };
}
