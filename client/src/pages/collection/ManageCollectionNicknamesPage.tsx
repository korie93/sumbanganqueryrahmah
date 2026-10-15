import { Suspense, lazy, memo, useMemo } from "react";
import { ShieldCheck } from "lucide-react";
import { LazyDialogFallback } from "@/components/LazySuspenseFallback";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { GroupListPanel } from "@/pages/collection-nicknames/GroupListPanel";
import { NicknameAssignmentPanel } from "@/pages/collection-nicknames/NicknameAssignmentPanel";
import { buildManageCollectionNicknamePageViewModels } from "@/pages/collection-nicknames/manage-collection-nicknames-view-models";
import { useCollectionNicknameManagementActions } from "@/pages/collection-nicknames/useCollectionNicknameManagementActions";
import { useCollectionNicknameManagementData } from "@/pages/collection-nicknames/useCollectionNicknameManagementData";
import { useCollectionNicknameManagementDialogs } from "@/pages/collection-nicknames/useCollectionNicknameManagementDialogs";

const CollectionNicknameDialogs = lazy(() =>
  import("@/pages/collection-nicknames/CollectionNicknameDialogs").then((module) => ({
    default: module.CollectionNicknameDialogs,
  })),
);

type Props = {
  role: string;
  currentNickname: string;
  onNicknameListChanged?: () => void;
};

function ManageCollectionNicknamesPage({
  role,
  currentNickname,
  onNicknameListChanged,
}: Props) {
  const isSuperuser = role === "superuser";
  const isMobile = useIsMobile();
  const nicknameData = useCollectionNicknameManagementData({ isSuperuser });
  const dialogs = useCollectionNicknameManagementDialogs();
  const actions = useCollectionNicknameManagementActions({
    nicknameData,
    dialogs,
    onNicknameListChanged,
  });
  const viewModels = buildManageCollectionNicknamePageViewModels({
    currentNickname,
    nicknameData,
    dialogs,
    actions,
  });
  const hasOpenDialogs = useMemo(
    () => Boolean(
      viewModels.dialogs.createGroupOpen ||
      viewModels.dialogs.changeLeaderOpen ||
      viewModels.dialogs.addOpen ||
      viewModels.dialogs.editingNickname ||
      viewModels.dialogs.pendingDeactivate ||
      viewModels.dialogs.pendingDeleteGroup ||
      viewModels.dialogs.pendingDeleteNickname ||
      viewModels.dialogs.pendingResetPassword ||
      viewModels.dialogs.pendingUngroup ||
      viewModels.dialogs.confirmSwitchOpen
    ),
    [viewModels.dialogs],
  );

  if (!isSuperuser) {
    return (
      <Card className="border-border/60 bg-background/70">
        <CardHeader>
          <CardTitle className="text-xl">Manage Nickname</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Hanya superuser dibenarkan mengurus admin nickname groups.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={`border-border/60 bg-background/70 ${isMobile ? "rounded-[1.75rem]" : ""}`}>
        <CardHeader className="space-y-2 p-4 pb-3 sm:p-5 sm:pb-4">
          <h2 className="text-lg font-semibold tracking-tight">Manage Nickname</h2>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">{viewModels.summaryText}</p>
            {isMobile ? (
              <Badge variant="secondary" className="rounded-full">
                <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Superuser Only
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent
          className="grid min-w-0 gap-4 px-4 pb-4 sm:px-5 sm:pb-5 xl:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]"
        >
          <GroupListPanel {...viewModels.groupList} />

          <NicknameAssignmentPanel {...viewModels.assignment} />
        </CardContent>
      </Card>

      {hasOpenDialogs ? (
        <Suspense fallback={<LazyDialogFallback label="Loading collection nickname management dialog..." />}>
          <CollectionNicknameDialogs {...viewModels.dialogs} />
        </Suspense>
      ) : null}
    </>
  );
}

const MemoizedManageCollectionNicknamesPage = memo(ManageCollectionNicknamesPage);
MemoizedManageCollectionNicknamesPage.displayName = "ManageCollectionNicknamesPage";

export default MemoizedManageCollectionNicknamesPage;
