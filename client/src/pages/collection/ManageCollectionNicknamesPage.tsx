import { Suspense, memo, useMemo } from "react";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { GroupListPanel } from "@/pages/collection-nicknames/GroupListPanel";
import { NicknameAssignmentPanel } from "@/pages/collection-nicknames/NicknameAssignmentPanel";
import { buildManageCollectionNicknamePageViewModels } from "@/pages/collection-nicknames/manage-collection-nicknames-view-models";
import { useCollectionNicknameManagementActions } from "@/pages/collection-nicknames/useCollectionNicknameManagementActions";
import { useCollectionNicknameManagementData } from "@/pages/collection-nicknames/useCollectionNicknameManagementData";
import { useCollectionNicknameManagementDialogs } from "@/pages/collection-nicknames/useCollectionNicknameManagementDialogs";

const CollectionNicknameDialogs = lazyWithPreload(() =>
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
      {isMobile ? (
        <section
          className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-background/80 px-4 py-4 shadow-sm"
          data-floating-ai-avoid="true"
        >
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent" />
          <div className="relative space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Collection
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Manage Nickname</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Manage admin nickname groups, member assignments, and password recovery actions from a calmer mobile workspace.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 rounded-2xl border border-border/60 bg-background/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Total Nickname
                </p>
                <p className="text-lg font-semibold text-foreground">{nicknameData.nicknames.length}</p>
              </div>
              <div className="space-y-1 rounded-2xl border border-border/60 bg-background/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Active Available
                </p>
                <p className="text-lg font-semibold text-foreground">{nicknameData.activeAvailable}</p>
              </div>
              <div className="space-y-1 rounded-2xl border border-border/60 bg-background/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Current Staff
                </p>
                <p className="truncate text-sm font-medium text-foreground">
                  {currentNickname || "No current staff nickname"}
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <Card className={`border-border/60 bg-background/70 ${isMobile ? "rounded-[1.75rem]" : ""}`}>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Manage Nickname</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">{viewModels.summaryText}</p>
            {isMobile ? (
              <Badge variant="secondary" className="rounded-full">
                <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                Superuser Only
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent
          className={isMobile ? "space-y-4" : "grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]"}
        >
          <GroupListPanel {...viewModels.groupList} />

          <NicknameAssignmentPanel {...viewModels.assignment} />
        </CardContent>
      </Card>

      {hasOpenDialogs ? (
        <Suspense fallback={null}>
          <CollectionNicknameDialogs {...viewModels.dialogs} />
        </Suspense>
      ) : null}
    </>
  );
}

const MemoizedManageCollectionNicknamesPage = memo(ManageCollectionNicknamesPage);
MemoizedManageCollectionNicknamesPage.displayName = "ManageCollectionNicknamesPage";

export default MemoizedManageCollectionNicknamesPage;
