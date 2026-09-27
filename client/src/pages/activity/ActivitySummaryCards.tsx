import { Clock, Shield, UserX, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivitySummaryCardsProps {
  bannedCount: number;
  className?: string;
  idleCount: number;
  kickedCount: number;
  logoutCount: number;
  onlineCount: number;
}

export function ActivitySummaryCards({
  bannedCount,
  className,
  idleCount,
  kickedCount,
  logoutCount,
  onlineCount,
}: ActivitySummaryCardsProps) {
  const metrics = [
    { key: "online", label: "Online", value: onlineCount, icon: Users, tone: "text-success" },
    { key: "idle", label: "Idle", value: idleCount, icon: Clock, tone: "text-warning" },
    { key: "logout", label: "Logout", value: logoutCount, icon: UserX, tone: "text-muted-foreground" },
    { key: "kicked", label: "Kicked", value: kickedCount, icon: UserX, tone: "text-warning" },
    { key: "banned", label: "Banned", value: bannedCount, icon: Shield, tone: "text-destructive" },
  ];

  return (
    <dl className={cn("grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-x-6 gap-y-3", className)}>
      {metrics.map(({ key, label, value, icon: Icon, tone }) => (
        <div key={key} className="min-w-0">
          <dt className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon className={cn("h-4 w-4", tone)} aria-hidden="true" />
            {label}
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-foreground" data-testid={`text-${key}-count`}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
