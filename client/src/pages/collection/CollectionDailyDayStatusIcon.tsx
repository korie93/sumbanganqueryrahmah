import { AlertTriangle, CheckCircle2, CircleSlash } from "lucide-react";
import type { CollectionDailyOverviewDay } from "@/lib/api";

export function CollectionDailyDayStatusIcon({
  status,
}: {
  status: CollectionDailyOverviewDay["status"];
}) {
  if (status === "green") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-700" aria-hidden="true" />;
  }
  if (status === "yellow") {
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />;
  }
  if (status === "red") {
    return <CircleSlash className="h-3.5 w-3.5 text-rose-700" aria-hidden="true" />;
  }
  return null;
}
