import { Suspense } from "react";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { ActivitySectionFallback, useDeferredActivitySectionMount } from "@/pages/activity/ActivityDeferredSection";
import { shouldRenderBannedUsersSection } from "@/pages/activity/activity-page-content-utils";
import type { BannedUser } from "@/pages/activity/types";

const ActivityBannedUsersPanel = lazyWithPreload(() =>
  import("@/pages/activity/ActivityBannedUsersPanel").then((module) => ({
    default: module.ActivityBannedUsersPanel,
  })),
);
const BANNED_USERS_DEFER_ROOT_MARGIN = "160px 0px";
const BANNED_USERS_DEFER_TIMEOUT_MS = 700;

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
    rootMargin: BANNED_USERS_DEFER_ROOT_MARGIN,
    timeoutMs: BANNED_USERS_DEFER_TIMEOUT_MS,
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
