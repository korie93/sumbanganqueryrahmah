import { Suspense, lazy } from "react";
import { ActivitySectionFallback, useDeferredActivitySectionMount } from "@/pages/activity/ActivityDeferredSection";
import { shouldRenderBannedUsersSection } from "@/pages/activity/activity-page-content-utils";
import type { BannedUser } from "@/pages/activity/types";

const ActivityBannedUsersPanel = lazy(() =>
  import("@/pages/activity/ActivityBannedUsersPanel").then((module) => ({
    default: module.ActivityBannedUsersPanel,
  })),
);

type ActivityBannedUsersSectionProps = {
  actionLoading: string | null;
  bannedUsers: BannedUser[];
  canModerateActivity: boolean;
  onSelectBannedUser: (user: BannedUser | null) => void;
  onUnbanDialogOpenChange: (open: boolean) => void;
  shouldDeferSecondaryMobileSections: boolean;
};

export function ActivityBannedUsersSection({
  actionLoading,
  bannedUsers,
  canModerateActivity,
  onSelectBannedUser,
  onUnbanDialogOpenChange,
  shouldDeferSecondaryMobileSections,
}: ActivityBannedUsersSectionProps) {
  const bannedUsersSection = useDeferredActivitySectionMount({
    enabled: shouldDeferSecondaryMobileSections,
    rootMargin: "160px 0px",
    timeoutMs: 700,
  });

  if (!shouldRenderBannedUsersSection(canModerateActivity, bannedUsers.length)) {
    return null;
  }

  return (
    <div ref={bannedUsersSection.triggerRef}>
      {bannedUsersSection.shouldRender ? (
        <Suspense fallback={<ActivitySectionFallback label="Loading banned users..." />}>
          <ActivityBannedUsersPanel
            actionLoading={actionLoading}
            bannedUsers={bannedUsers}
            onUnbanClick={(user) => {
              onSelectBannedUser(user);
              onUnbanDialogOpenChange(true);
            }}
          />
        </Suspense>
      ) : (
        <ActivitySectionFallback label="Banned users will load as you scroll." />
      )}
    </div>
  );
}
