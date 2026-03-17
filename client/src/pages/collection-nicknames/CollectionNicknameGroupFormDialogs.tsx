import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  return (
    <>
      <Dialog open={createGroupOpen} onOpenChange={onCreateGroupOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Admin Group</DialogTitle>
            <DialogDescription>Pilih leader nickname untuk group admin baharu.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Leader Nickname</Label>
            <Select value={createLeaderId} onValueChange={onCreateLeaderIdChange}>
              <SelectTrigger>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => onCreateGroupOpenChange(false)} disabled={creatingGroup}>
              Batal
            </Button>
            <Button onClick={onCreateGroup} disabled={creatingGroup || !createLeaderId}>
              {creatingGroup ? "Saving..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changeLeaderOpen} onOpenChange={onChangeLeaderOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tukar Leader Group</DialogTitle>
            <DialogDescription>Leader nickname mesti unik dan bertaraf admin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Leader Nickname</Label>
            <Select value={changeLeaderId} onValueChange={onChangeLeaderIdChange}>
              <SelectTrigger>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => onChangeLeaderOpenChange(false)} disabled={savingLeader}>
              Batal
            </Button>
            <Button onClick={onSaveLeader} disabled={savingLeader || !changeLeaderId}>
              {savingLeader ? "Saving..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
