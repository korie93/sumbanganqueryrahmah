import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollectionNicknameDialogs } from "@/pages/collection-nicknames/CollectionNicknameDialogs";
import { GroupListPanel } from "@/pages/collection-nicknames/GroupListPanel";
import { NicknameAssignmentPanel } from "@/pages/collection-nicknames/NicknameAssignmentPanel";
import { buildManageCollectionNicknamePageViewModels } from "@/pages/collection-nicknames/manage-collection-nicknames-view-models";
import { useCollectionNicknameManagementActions } from "@/pages/collection-nicknames/useCollectionNicknameManagementActions";
import { useCollectionNicknameManagementData } from "@/pages/collection-nicknames/useCollectionNicknameManagementData";
import { useCollectionNicknameManagementDialogs } from "@/pages/collection-nicknames/useCollectionNicknameManagementDialogs";

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
      <Card className="border-border/60 bg-background/70">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Manage Nickname</CardTitle>
          <p className="text-xs text-muted-foreground">{viewModels.summaryText}</p>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <GroupListPanel {...viewModels.groupList} />

          <NicknameAssignmentPanel {...viewModels.assignment} />
        </CardContent>
      </Card>

      <CollectionNicknameDialogs {...viewModels.dialogs} />
    </>
  );
}

const MemoizedManageCollectionNicknamesPage = memo(ManageCollectionNicknamesPage);
MemoizedManageCollectionNicknamesPage.displayName = "ManageCollectionNicknamesPage";

export default MemoizedManageCollectionNicknamesPage;
