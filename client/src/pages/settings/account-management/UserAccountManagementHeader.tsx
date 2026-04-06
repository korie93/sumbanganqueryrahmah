import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildUserAccountManagementBadgeSummary,
  getUserAccountManagementDescription,
} from "@/pages/settings/account-management/user-account-management-utils";

type UserAccountManagementHeaderProps = {
  isMobile: boolean;
  managedUserCount: number;
  outboxCount: number;
  pendingResetCount: number;
};

export function UserAccountManagementHeader({
  isMobile,
  managedUserCount,
  outboxCount,
  pendingResetCount,
}: UserAccountManagementHeaderProps) {
  const badgeSummary = buildUserAccountManagementBadgeSummary({
    managedUserCount,
    outboxCount,
    pendingResetCount,
  });

  return (
    <CardHeader className={isMobile ? "space-y-4 pb-4" : undefined}>
      <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
        <Users className="h-5 w-5" />
        User Account Management
      </CardTitle>
      <p className="text-sm text-muted-foreground">
        {getUserAccountManagementDescription(isMobile)}
      </p>
      {isMobile ? (
        <div className="flex flex-wrap gap-2">
          {badgeSummary.map((badge) => (
            <Badge
              key={badge.label}
              variant={badge.variant}
              className="rounded-full px-3 py-1"
            >
              {badge.label} {badge.total}
            </Badge>
          ))}
        </div>
      ) : null}
    </CardHeader>
  );
}
