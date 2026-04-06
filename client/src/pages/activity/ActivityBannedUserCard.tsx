import { parseActivityUserAgent } from "@/pages/activity/utils";
import { ActivityBannedUserHeader } from "@/pages/activity/ActivityBannedUserHeader";
import { ActivityDesktopBanDetails } from "@/pages/activity/ActivityDesktopBanDetails";
import { ActivityMobileBanDetails } from "@/pages/activity/ActivityMobileBanDetails";
import {
  getBannedUserBrowserText,
  getBannedUserCardClassName,
  getBannedUserIpText,
  getBannedUserTimestampText,
} from "@/pages/activity/activity-banned-users-utils";
import type { BannedUser } from "@/pages/activity/types";

type ActivityBannedUserCardProps = {
  actionLoading: string | null;
  isMobile: boolean;
  onUnbanClick: (user: BannedUser) => void;
  user: BannedUser;
};

export function ActivityBannedUserCard({
  actionLoading,
  isMobile,
  onUnbanClick,
  user,
}: ActivityBannedUserCardProps) {
  const parsedBrowser = user.banInfo?.browser ? parseActivityUserAgent(user.banInfo.browser) : null;
  const browserText = getBannedUserBrowserText(parsedBrowser);
  const ipText = getBannedUserIpText(user.banInfo?.ipAddress, !isMobile);
  const bannedAtText = getBannedUserTimestampText(user.banInfo?.bannedAt, !isMobile);

  return (
    <div
      className={getBannedUserCardClassName(isMobile)}
      data-testid={`banned-user-${user.visitorId}`}
    >
      <ActivityBannedUserHeader
        actionLoading={actionLoading}
        onUnbanClick={onUnbanClick}
        user={user}
      />
      {user.banInfo ? (
        isMobile ? (
          <ActivityMobileBanDetails
            bannedAtText={bannedAtText}
            browserText={browserText}
            ipText={getBannedUserIpText(user.banInfo.ipAddress)}
          />
        ) : (
          <ActivityDesktopBanDetails
            bannedAtText={bannedAtText}
            browserText={browserText}
            ipText={ipText}
          />
        )
      ) : null}
    </div>
  );
}
