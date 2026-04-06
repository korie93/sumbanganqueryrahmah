import { Badge } from "@/components/ui/badge";
import type { ActivityStatus } from "@/pages/activity/types";

export function getStatusBadge(status: ActivityStatus) {
  switch (status) {
    case "ONLINE":
      return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">ONLINE</Badge>;
    case "IDLE":
      return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">IDLE</Badge>;
    case "LOGOUT":
      return <Badge variant="secondary">LOGOUT</Badge>;
    case "KICKED":
      return <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">KICKED</Badge>;
    case "BANNED":
      return <Badge variant="destructive">BANNED</Badge>;
  }
}
