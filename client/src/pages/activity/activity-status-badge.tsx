import { Badge } from "@/components/ui/badge";
import type { ActivityStatus } from "@/pages/activity/types";

export function getStatusBadge(status: ActivityStatus) {
  switch (status) {
    case "ONLINE":
      return (
        <Badge variant="outline" className="border-green-300/70 bg-green-50 text-green-700 dark:bg-green-950/35 dark:text-green-300">
          ONLINE
        </Badge>
      );
    case "IDLE":
      return (
        <Badge variant="outline" className="border-amber-300/70 bg-amber-50 text-amber-800 dark:bg-amber-950/35 dark:text-amber-300">
          IDLE
        </Badge>
      );
    case "LOGOUT":
      return (
        <Badge variant="outline" className="border-slate-300/70 bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
          LOGOUT
        </Badge>
      );
    case "KICKED":
      return (
        <Badge variant="outline" className="border-orange-300/70 bg-orange-50 text-orange-800 dark:bg-orange-950/35 dark:text-orange-300">
          KICKED
        </Badge>
      );
    case "BANNED":
      return (
        <Badge variant="outline" className="border-rose-300/70 bg-rose-50 text-rose-800 dark:bg-rose-950/35 dark:text-rose-200">
          BANNED
        </Badge>
      );
  }
}
