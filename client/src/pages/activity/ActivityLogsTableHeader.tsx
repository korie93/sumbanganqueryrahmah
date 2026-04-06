import { Activity as ActivityIcon, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollapsibleTrigger } from "@/components/ui/collapsible";
import { getActivityLogsCountLabel } from "@/pages/activity/activity-logs-table-utils";

type ActivityLogsTableHeaderProps = {
  activityCount: number;
  logsOpen: boolean;
};

export function ActivityLogsTableHeader({
  activityCount,
  logsOpen,
}: ActivityLogsTableHeaderProps) {
  return (
    <CollapsibleTrigger
      asChild
    >
      <Button
        variant="ghost"
        className="mb-4 flex h-auto w-full items-center justify-between gap-2 p-0"
        data-testid="button-toggle-logs"
      >
        <div className="flex items-center gap-2">
          <ActivityIcon className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">Activity Logs</span>
          <Badge variant="secondary">{getActivityLogsCountLabel(activityCount)}</Badge>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground transition-transform ${logsOpen ? "rotate-180" : ""}`}
        />
      </Button>
    </CollapsibleTrigger>
  );
}
