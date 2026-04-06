import { Shield } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ActivityBannedUserCard } from "@/pages/activity/ActivityBannedUserCard";
import { getBannedUsersPanelTitleClassName } from "@/pages/activity/activity-banned-users-utils";
import type { BannedUser } from "@/pages/activity/types";

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
      <h2 className={getBannedUsersPanelTitleClassName(isMobile)}>
        <Shield className="w-5 h-5 text-destructive" />
        Banned Users
      </h2>

      <div className="space-y-3">
        {bannedUsers.map((user) => (
          <ActivityBannedUserCard
            key={user.visitorId}
            actionLoading={actionLoading}
            isMobile={isMobile}
            onUnbanClick={onUnbanClick}
            user={user}
          />
        ))}
      </div>
    </div>
  );
}
