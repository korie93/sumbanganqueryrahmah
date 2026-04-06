import { Shield, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BannedUser } from "@/pages/activity/types";

type ActivityBannedUserHeaderProps = {
  actionLoading: string | null;
  onUnbanClick: (user: BannedUser) => void;
  user: BannedUser;
};

export function ActivityBannedUserHeader({
  actionLoading,
  onUnbanClick,
  user,
}: ActivityBannedUserHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex min-w-0 items-center gap-3">
        <Shield className="w-4 h-4 text-destructive" />
        <span className="truncate font-medium text-foreground">{user.username}</span>
        <Badge variant="outline" className="text-xs">
          {user.role}
        </Badge>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onUnbanClick(user)}
        disabled={actionLoading === (user.banId || user.visitorId)}
        data-testid={`button-unban-${user.visitorId}`}
      >
        <ShieldOff className="w-4 h-4 mr-1" />
        Unban
      </Button>
    </div>
  );
}
