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

  return (
    <>
      <Dialog open={createGroupOpen} onOpenChange={onCreateGroupOpenChange}>
        <DialogContent
          className={isMobile ? "max-w-md rounded-[1.5rem] border-border/60 p-5 pt-6 shadow-2xl" : "max-w-md"}
          data-floating-ai-avoid="true"
        >
          <DialogHeader className={isMobile ? "pr-8 text-left" : undefined}>
            <DialogTitle>Tambah Admin Group</DialogTitle>
            <DialogDescription>Pilih leader nickname untuk group admin baharu.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Leader Nickname</Label>
            <Select value={createLeaderId} onValueChange={onCreateLeaderIdChange}>
              <SelectTrigger className={isMobile ? "h-12 rounded-2xl" : undefined}>
                <SelectValue placeholder="Pilih leader nickname" />
              </SelectTrigger>
              <SelectContent>
                {leaderOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.nickname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className={isMobile ? "gap-3 pt-2" : undefined}>
            <Button
              variant="outline"
              onClick={() => onCreateGroupOpenChange(false)}
              disabled={creatingGroup}
              className={isMobile ? "h-11 w-full rounded-xl" : undefined}
            >
              Batal
            </Button>
            <Button
              onClick={onCreateGroup}
              disabled={creatingGroup || !createLeaderId}
              className={isMobile ? "h-11 w-full rounded-xl" : undefined}
            >
              {creatingGroup ? "Saving..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changeLeaderOpen} onOpenChange={onChangeLeaderOpenChange}>
        <DialogContent
          className={isMobile ? "max-w-md rounded-[1.5rem] border-border/60 p-5 pt-6 shadow-2xl" : "max-w-md"}
          data-floating-ai-avoid="true"
        >
          <DialogHeader className={isMobile ? "pr-8 text-left" : undefined}>
            <DialogTitle>Tukar Leader Group</DialogTitle>
            <DialogDescription>Leader nickname mesti unik dan bertaraf admin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Leader Nickname</Label>
            <Select value={changeLeaderId} onValueChange={onChangeLeaderIdChange}>
              <SelectTrigger className={isMobile ? "h-12 rounded-2xl" : undefined}>
                <SelectValue placeholder="Pilih leader nickname" />
              </SelectTrigger>
              <SelectContent>
                {leaderOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.nickname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className={isMobile ? "gap-3 pt-2" : undefined}>
            <Button
              variant="outline"
              onClick={() => onChangeLeaderOpenChange(false)}
              disabled={savingLeader}
              className={isMobile ? "h-11 w-full rounded-xl" : undefined}
            >
              Batal
            </Button>
            <Button
              onClick={onSaveLeader}
              disabled={savingLeader || !changeLeaderId}
              className={isMobile ? "h-11 w-full rounded-xl" : undefined}
            >
              {savingLeader ? "Saving..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
