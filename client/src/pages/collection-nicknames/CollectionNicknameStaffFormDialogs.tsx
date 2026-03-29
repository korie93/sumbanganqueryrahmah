import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CollectionNicknameDialogsProps } from "@/pages/collection-nicknames/collection-nickname-dialog-types";
import { ROLE_SCOPE_OPTIONS } from "@/pages/collection-nicknames/utils";

export type CollectionNicknameStaffFormDialogsProps = Pick<
  CollectionNicknameDialogsProps,
  | "addOpen"
  | "newNickname"
  | "newRoleScope"
  | "addingNickname"
  | "editingNickname"
  | "editValue"
  | "editRoleScope"
  | "savingEdit"
  | "onAddOpenChange"
  | "onNewNicknameChange"
  | "onNewRoleScopeChange"
  | "onCreateNickname"
  | "onEditingNicknameOpenChange"
  | "onEditValueChange"
  | "onEditRoleScopeChange"
  | "onSaveEditNickname"
>;

export function CollectionNicknameStaffFormDialogs({
  addOpen,
  newNickname,
  newRoleScope,
  addingNickname,
  editingNickname,
  editValue,
  editRoleScope,
  savingEdit,
  onAddOpenChange,
  onNewNicknameChange,
  onNewRoleScopeChange,
  onCreateNickname,
  onEditingNicknameOpenChange,
  onEditValueChange,
  onEditRoleScopeChange,
  onSaveEditNickname,
}: CollectionNicknameStaffFormDialogsProps) {
  return (
    <>
      <Dialog open={addOpen} onOpenChange={onAddOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Nickname</DialogTitle>
            <DialogDescription>Tambah nickname rasmi baharu dan tetapkan role scope.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nickname</Label>
            <Input
              value={newNickname}
              onChange={(event) => onNewNicknameChange(event.target.value)}
              placeholder="Contoh: SW.NAMA_NO"
              maxLength={64}
            />
          </div>
          <div className="space-y-2">
            <Label>Role Scope</Label>
            <Select value={newRoleScope} onValueChange={onNewRoleScopeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih role scope" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_SCOPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onAddOpenChange(false)} disabled={addingNickname}>
              Batal
            </Button>
            <Button onClick={onCreateNickname} disabled={addingNickname}>
              {addingNickname ? "Saving..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingNickname)} onOpenChange={onEditingNicknameOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Nickname</DialogTitle>
            <DialogDescription>Kemaskini nama nickname dan role scope akses nickname.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nickname</Label>
            <Input value={editValue} onChange={(event) => onEditValueChange(event.target.value)} maxLength={64} />
          </div>
          <div className="space-y-2">
            <Label>Role Scope</Label>
            <Select value={editRoleScope} onValueChange={onEditRoleScopeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih role scope" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_SCOPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onEditingNicknameOpenChange(false)} disabled={savingEdit}>
              Batal
            </Button>
            <Button onClick={onSaveEditNickname} disabled={savingEdit}>
              {savingEdit ? "Saving..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
