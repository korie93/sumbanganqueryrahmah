import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CollectionNicknameDialogsProps } from "@/pages/collection-nicknames/collection-nickname-dialog-types";

export type CollectionNicknameGroupFormDialogsProps = Pick<
  CollectionNicknameDialogsProps,
  | "leaderOptions"
  | "createGroupOpen"
  | "createLeaderId"
  | "creatingGroup"
  | "changeLeaderOpen"
  | "changeLeaderId"
  | "savingLeader"
  | "onCreateGroupOpenChange"
  | "onCreateLeaderIdChange"
  | "onCreateGroup"
  | "onChangeLeaderOpenChange"
  | "onChangeLeaderIdChange"
  | "onSaveLeader"
>;

export function CollectionNicknameGroupFormDialogs({
  leaderOptions,
  createGroupOpen,
  createLeaderId,
  creatingGroup,
  changeLeaderOpen,
  changeLeaderId,
  savingLeader,
  onCreateGroupOpenChange,
  onCreateLeaderIdChange,
  onCreateGroup,
  onChangeLeaderOpenChange,
  onChangeLeaderIdChange,
  onSaveLeader,
}: CollectionNicknameGroupFormDialogsProps) {
  const isMobile = useIsMobile();
  const leaderTriggerClassName = cn(
    "gap-2 [&>span]:min-w-0 [&>span]:truncate [&>svg]:shrink-0",
    isMobile && "h-12 rounded-2xl",
  );
  const leaderOptionsClassName =
    "w-[var(--radix-select-trigger-width)] [overflow-wrap:anywhere] [&_[data-radix-select-viewport]]:min-w-0";
  const createLeaderTriggerId = "create-admin-group-leader-nickname";
  const changeLeaderTriggerId = "change-admin-group-leader-nickname";

  return (
    <>
      <Dialog open={createGroupOpen} onOpenChange={onCreateGroupOpenChange}>
        <DialogContent
          className={isMobile ? "grid-cols-1 max-w-md rounded-[1.5rem] border-border/60 p-5 pt-6 shadow-2xl" : "grid-cols-1 max-w-md"}
          data-floating-ai-avoid="true"
        >
          <DialogHeader className={isMobile ? "pr-8 text-left" : ""}>
            <DialogTitle>Tambah Admin Group</DialogTitle>
            <DialogDescription>Pilih leader nickname untuk group admin baharu.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={createLeaderTriggerId}>Leader Nickname</Label>
            <Select value={createLeaderId} onValueChange={onCreateLeaderIdChange}>
              <SelectTrigger id={createLeaderTriggerId} className={leaderTriggerClassName}>
                <SelectValue placeholder="Pilih leader nickname" />
              </SelectTrigger>
              <SelectContent className={leaderOptionsClassName}>
                {leaderOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.nickname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className={isMobile ? "gap-3 pt-2" : ""}>
            <Button
              variant="outline"
              onClick={() => onCreateGroupOpenChange(false)}
              disabled={creatingGroup}
              className={isMobile ? "h-11 w-full rounded-xl" : ""}
            >
              Batal
            </Button>
            <Button
              onClick={onCreateGroup}
              disabled={creatingGroup || !createLeaderId}
              className={isMobile ? "h-11 w-full rounded-xl" : ""}
            >
              {creatingGroup ? "Saving..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changeLeaderOpen} onOpenChange={onChangeLeaderOpenChange}>
        <DialogContent
          className={isMobile ? "grid-cols-1 max-w-md rounded-[1.5rem] border-border/60 p-5 pt-6 shadow-2xl" : "grid-cols-1 max-w-md"}
          data-floating-ai-avoid="true"
        >
          <DialogHeader className={isMobile ? "pr-8 text-left" : ""}>
            <DialogTitle>Tukar Leader Group</DialogTitle>
            <DialogDescription>Leader nickname mesti unik dan bertaraf admin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={changeLeaderTriggerId}>Leader Nickname</Label>
            <Select value={changeLeaderId} onValueChange={onChangeLeaderIdChange}>
              <SelectTrigger id={changeLeaderTriggerId} className={leaderTriggerClassName}>
                <SelectValue placeholder="Pilih leader nickname" />
              </SelectTrigger>
              <SelectContent className={leaderOptionsClassName}>
                {leaderOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.nickname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className={isMobile ? "gap-3 pt-2" : ""}>
            <Button
              variant="outline"
              onClick={() => onChangeLeaderOpenChange(false)}
              disabled={savingLeader}
              className={isMobile ? "h-11 w-full rounded-xl" : ""}
            >
              Batal
            </Button>
            <Button
              onClick={onSaveLeader}
              disabled={savingLeader || !changeLeaderId}
              className={isMobile ? "h-11 w-full rounded-xl" : ""}
            >
              {savingLeader ? "Saving..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
