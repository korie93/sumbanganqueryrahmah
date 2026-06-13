import { Link2, Monitor, Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ActivityInvestigation } from "@/lib/api";
import { getActivityDeviceTypeLabel } from "@/pages/activity/activity-device-utils";
import { formatActivityTime, getStatusBadge } from "@/pages/activity/utils";

type RelatedSession = ActivityInvestigation["relatedSessions"][number];

const MATCH_LABELS: Record<RelatedSession["matches"][number], string> = {
  device_fingerprint: "Same device",
  ip_address: "Same IP",
  same_account: "Same account",
};

function RelatedSessionDevice({ session }: { session: RelatedSession }) {
  const deviceType = getActivityDeviceTypeLabel(session.device.deviceType);
  const platform = String(session.device.platform || "").trim();
  const deviceLabel = platform ? `${deviceType} - ${platform}` : deviceType;

  return (
    <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate" title={deviceLabel}>{deviceLabel}</span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <Network className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate" title={session.device.ipAddress || "IP not recorded"}>
          {session.device.ipAddress || "IP not recorded"}
        </span>
      </span>
    </div>
  );
}

export function ActivityInvestigationRelatedSessions({
  sessions,
}: {
  sessions: ActivityInvestigation["relatedSessions"];
}) {
  return (
    <section className="border-b border-border/70 py-5" aria-labelledby="related-sessions-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="related-sessions-heading" className="text-sm font-semibold text-foreground">
            Related sessions
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Recent sessions correlated by account, IP address, or protected device fingerprint.
          </p>
        </div>
        <Badge variant="outline">{sessions.length}</Badge>
      </div>

      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No related session was found in the retained activity history.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-border/70 border-y border-border/70">
          {sessions.map((session) => (
            <article key={session.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {session.username}
                    </span>
                    <Badge variant="outline" className="text-2xs">{session.role}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Login {session.loginTime ? formatActivityTime(session.loginTime) : "not recorded"}
                  </p>
                </div>
                {getStatusBadge(session.status)}
              </div>

              <RelatedSessionDevice session={session} />

              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Correlation reasons">
                {session.matches.map((match) => (
                  <Badge key={match} variant="secondary" className="gap-1 text-2xs">
                    <Link2 className="h-3 w-3" aria-hidden="true" />
                    {MATCH_LABELS[match]}
                  </Badge>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
