import type { AuditLogRecord } from "@/pages/audit-logs/types";

type AuditLogRowAriaOptions = {
  actionLabel: string;
  formattedTimestamp: string;
  log: AuditLogRecord;
  riskLabel?: string | undefined;
};

export function buildAuditLogRowAriaLabel({
  actionLabel,
  formattedTimestamp,
  log,
  riskLabel,
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
  if (riskLabel) {
    details.push(`risk ${riskLabel}`);
  }

  return details.join(", ");
}
