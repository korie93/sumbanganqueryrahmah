import type { AuditLogRecord } from "@/pages/audit-logs/types";

type AuditLogRowAriaOptions = {
  actionLabel: string;
  formattedTimestamp: string;
  log: AuditLogRecord;
};

export function buildAuditLogRowAriaLabel({
  actionLabel,
  formattedTimestamp,
  log,
}: AuditLogRowAriaOptions) {
  const details = [
    `Audit log ${actionLabel}`,
    `performed by ${log.performedBy}`,
    `recorded ${formattedTimestamp}`,
  ];

  if (log.targetUser) {
    details.push(`target user ${log.targetUser}`);
  }
  if (log.targetResource) {
    details.push(`resource ${log.targetResource}`);
  }

  return details.join(", ");
}
