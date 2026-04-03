import { Clock, Globe, Monitor, Shield, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatOperationalDateTime } from "@/lib/date-format";
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
  const isMobile = useIsMobile();

  if (bannedUsers.length === 0) {
    return null;
  }

  return (
    <div className={`glass-wrapper mb-6 ${isMobile ? "p-4" : "p-6"}`}>
      <h2 className={`${isMobile ? "mb-3 text-base" : "mb-4 text-lg"} flex items-center gap-2 font-semibold text-foreground`}>
        <Shield className="w-5 h-5 text-destructive" />
        Banned Users
      </h2>

      <div className="space-y-3">
        {bannedUsers.map((user) => {
          const banBrowser = user.banInfo?.browser ? parseActivityUserAgent(user.banInfo.browser) : null;
          return (
            <div
              key={user.visitorId}
              className={`bg-destructive/5 border border-destructive/20 ${isMobile ? "rounded-2xl p-3.5" : "rounded-lg p-4"}`}
              data-testid={`banned-user-${user.visitorId}`}
            >
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
              {user.banInfo ? (
                isMobile ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/15 bg-background/70 px-2.5 py-1">
                      <Globe className="h-3.5 w-3.5" />
                      {user.banInfo.ipAddress || "Unknown IP"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/15 bg-background/70 px-2.5 py-1">
                      <Monitor className="h-3.5 w-3.5" />
                      {banBrowser ? `${banBrowser.browser} ${banBrowser.version}` : "Unknown browser"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/15 bg-background/70 px-2.5 py-1">
                      <Clock className="h-3.5 w-3.5" />
                      {user.banInfo.bannedAt
                        ? formatOperationalDateTime(user.banInfo.bannedAt, { fallback: "Unknown" })
                        : "Unknown"}
                    </span>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-destructive/10 pt-3 text-sm sm:grid-cols-3">
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
                      <span>
                        Banned: {user.banInfo.bannedAt
                          ? formatOperationalDateTime(user.banInfo.bannedAt, { fallback: "Unknown" })
                          : "Unknown"}
                      </span>
                    </div>
                  </div>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
