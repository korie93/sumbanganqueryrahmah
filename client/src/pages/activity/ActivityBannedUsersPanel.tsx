import { Clock, Globe, Monitor, Shield, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import type { BannedUser } from "@/pages/activity/types";
import { parseActivityUserAgent } from "@/pages/activity/utils";

interface ActivityBannedUsersPanelProps {
  actionLoading: string | null;
  bannedUsers: BannedUser[];
  onUnbanClick: (user: BannedUser) => void;
}

export function ActivityBannedUsersPanel({
  actionLoading,
  bannedUsers,
  onUnbanClick,
}: ActivityBannedUsersPanelProps) {
  if (bannedUsers.length === 0) {
    return null;
  }

  return (
    <div className="glass-wrapper p-6 mb-6">
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Shield className="w-5 h-5 text-destructive" />
        Banned Users
      </h2>

      <div className="space-y-3">
        {bannedUsers.map((user) => {
          const banBrowser = user.banInfo?.browser ? parseActivityUserAgent(user.banInfo.browser) : null;
          return (
            <div
              key={user.visitorId}
              className="p-4 bg-destructive/5 rounded-lg border border-destructive/20"
              data-testid={`banned-user-${user.visitorId}`}
            >
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-destructive" />
                  <span className="font-medium text-foreground">{user.username}</span>
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
              {user.banInfo ? (
                <div className="mt-3 pt-3 border-t border-destructive/10 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Globe className="w-3.5 h-3.5" />
                    <span>IP: {user.banInfo.ipAddress || "Unknown"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Monitor className="w-3.5 h-3.5" />
                    <span>{banBrowser ? `${banBrowser.browser} ${banBrowser.version}` : "Unknown browser"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Banned: {user.banInfo.bannedAt ? formatDateTimeDDMMYYYY(user.banInfo.bannedAt) : "Unknown"}</span>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
