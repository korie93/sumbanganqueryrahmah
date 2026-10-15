import { Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getManagedAccountLoginAccess } from "./managed-account-list-presentation";
import { formatDateTime } from "./utils";
import type { ManagedUser } from "@/pages/settings/types";

export function ManagedAccountLoginAccess({ user }: { user: ManagedUser }) {
  const access = getManagedAccountLoginAccess(user);
  return (
    <div className="min-w-0 space-y-1" data-testid="managed-account-login-access">
      <Badge variant="outline" className={cn("max-w-full gap-2 rounded-md px-2 py-0.5 text-xs font-medium",
        access.tone === "danger" && "border-destructive/15 bg-destructive/10 text-destructive",
        access.tone === "warning" && "border-warning/20 bg-warning/10 text-warning",
        access.tone === "success" && "border-success/20 bg-success/10 text-success",
        access.tone === "neutral" && "border-border bg-muted text-muted-foreground",
      )}>
        <Circle className="h-2 w-2 shrink-0 fill-current" aria-hidden="true" />
        <span className="whitespace-normal break-words">{access.label}</span>
      </Badge>
      <p className="break-words text-xs leading-5 text-muted-foreground">{access.description}</p>
      {user.lockedAt ? <p className="text-xs tabular-nums text-muted-foreground">Locked {formatDateTime(user.lockedAt)}</p> : null}
    </div>
  );
}
