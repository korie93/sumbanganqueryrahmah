import {
  OperationalMetric,
  OperationalSectionCard,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import type { MaintenanceSettingsSummary } from "@/pages/settings/maintenance-settings-summary";

type MaintenanceSettingsNoticeProps = {
  summary: MaintenanceSettingsSummary;
  currentUserRole: string;
};

function getBadgeVariant(status: MaintenanceSettingsSummary["status"]) {
  if (status === "active-hard") return "destructive" as const;
  if (status === "active-soft" || status === "scheduled" || status === "expired") {
    return "secondary" as const;
  }
  return "outline" as const;
}

function getBadgeLabel(summary: MaintenanceSettingsSummary) {
  if (summary.status === "active-hard") return "Hard active";
  if (summary.status === "active-soft") return "Soft active";
  if (summary.status === "scheduled") return "Scheduled";
  if (summary.status === "expired") return "Window ended";
  return "Inactive";
}

export function MaintenanceSettingsNotice({
  summary,
  currentUserRole,
}: MaintenanceSettingsNoticeProps) {
  return (
    <OperationalSectionCard
      title="Maintenance behavior"
      description="This summary reflects the values currently shown below, including unsaved drafts."
      badge={
        <Badge variant={getBadgeVariant(summary.status)} className="rounded-full px-3 py-1">
          {getBadgeLabel(summary)}
        </Badge>
      }
      contentClassName="space-y-4"
    >
      <OperationalSummaryStrip>
        <OperationalMetric
          label="Status"
          value={summary.title}
          supporting={summary.description}
          tone={summary.status === "active-hard" ? "danger" : summary.status === "inactive" ? "default" : "warning"}
        />
        <OperationalMetric
          label="Mode"
          value={summary.mode === "hard" ? "Hard maintenance" : "Soft maintenance"}
          supporting={
            summary.mode === "hard"
              ? "Protected routes redirect standard users to /maintenance."
              : "Only Search, Imports, and AI APIs are blocked."
          }
        />
        <OperationalMetric
          label="Start time"
          value={formatDateTimeDDMMYYYY(summary.startTime, { fallback: "Immediate" })}
          supporting="Future start times keep maintenance inactive until the window begins."
        />
        <OperationalMetric
          label="End time"
          value={formatDateTimeDDMMYYYY(summary.endTime, { fallback: "Until switched off" })}
          supporting="Past end times automatically stop maintenance enforcement."
        />
      </OperationalSummaryStrip>

      <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
          <p className="font-medium text-foreground">Who is affected</p>
          <p className="mt-2 leading-6">
            Standard users are affected by maintenance rules. Admin and superuser accounts are
            allowed to keep operating during maintenance for control and recovery tasks.
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
          <p className="font-medium text-foreground">Current operator session</p>
          <p className="mt-2 leading-6">
            You are signed in as <span className="font-medium text-foreground">{currentUserRole || "unknown"}</span>.
            {currentUserRole === "admin" || currentUserRole === "superuser"
              ? " This role bypasses maintenance enforcement by design."
              : " This role should experience maintenance restrictions when the window is active."}
          </p>
        </div>
      </div>
    </OperationalSectionCard>
  );
}
