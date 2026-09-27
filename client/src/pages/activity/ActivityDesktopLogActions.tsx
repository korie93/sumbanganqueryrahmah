import { ActivityRowActions } from "./ActivityRowActions";
import type { ActivityDesktopLogActionsProps } from "@/pages/activity/activity-desktop-logs-shared";

export function ActivityDesktopLogActions(props: ActivityDesktopLogActionsProps) {
  return <ActivityRowActions {...props} />;
}
