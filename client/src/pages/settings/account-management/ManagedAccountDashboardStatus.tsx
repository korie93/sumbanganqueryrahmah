import { CircleAlert, Clock3, Link2, Link2Off } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DashboardAccountOptions } from "@/lib/api/collection-dashboard-account";

type Props = {
  link: DashboardAccountOptions["link"] | undefined;
  loadError: boolean;
};

export function ManagedAccountDashboardStatus({ link, loadError }: Props) {
  const loaded = link !== undefined;
  const needsReview = Boolean(link?.nicknameId && !link.isActive);
  const linked = Boolean(link?.isActive);
  const status = !loaded ? loadError ? "Status tidak tersedia" : "Memuatkan status…"
    : needsReview ? "Perlu semakan"
    : linked ? `Dipautkan: ${link?.nickname ?? "Nickname Collection"}`
    : link ? "Tiada pautan" : "Belum ditetapkan";
  const Icon = !loaded ? loadError ? CircleAlert : Clock3
    : needsReview ? CircleAlert : linked ? Link2 : Link2Off;

  return <Badge variant="outline" data-testid="dashboard-nickname-status"
    aria-live="polite" aria-atomic="true"
    className={cn("max-w-full min-w-0 items-start gap-2 whitespace-normal rounded-md px-2 py-1 text-sm font-medium",
      linked && "border-success/20 bg-success/10 text-success",
      needsReview && "border-warning/20 bg-warning/10 text-warning",
      !linked && !needsReview && "border-border bg-muted text-muted-foreground",
    )}>
    <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <span className="min-w-0 break-words">{status}</span>
  </Badge>;
}
