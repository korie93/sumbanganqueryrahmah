import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
  const newRoleScopeTriggerId = "collection-nickname-new-role-scope";
  const editRoleScopeTriggerId = "collection-nickname-edit-role-scope";

  return (
    <>
      <Dialog open={addOpen} onOpenChange={onAddOpenChange}>
        <DialogContent
          className={isMobile ? "max-w-md rounded-[1.5rem] border-border/60 p-5 pt-6 shadow-2xl" : "max-w-md"}
          data-floating-ai-avoid="true"
        >
          <DialogHeader className={isMobile ? "pr-8 text-left" : undefined}>
            <DialogTitle>Tambah Nickname</DialogTitle>
            <DialogDescription>Tambah nickname rasmi baharu dan tetapkan role scope.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="collection-nickname-new-value">Nickname</Label>
            <Input
              id="collection-nickname-new-value"
              name="collectionNickname"
              value={newNickname}
              onChange={(event) => onNewNicknameChange(event.target.value)}
              placeholder="Contoh: SW.NAMA_NO"
              autoComplete="off"
              maxLength={64}
              className={isMobile ? "h-12 rounded-2xl" : undefined}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={newRoleScopeTriggerId}>Role Scope</Label>
            <Select value={newRoleScope} onValueChange={onNewRoleScopeChange}>
              <SelectTrigger id={newRoleScopeTriggerId} className={isMobile ? "h-12 rounded-2xl" : undefined}>
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
          <DialogFooter className={isMobile ? "gap-3 pt-2" : undefined}>
            <Button
              variant="outline"
              onClick={() => onAddOpenChange(false)}
              disabled={addingNickname}
              className={isMobile ? "h-11 w-full rounded-xl" : undefined}
            >
              Batal
            </Button>
            <Button
              onClick={onCreateNickname}
              disabled={addingNickname}
              className={isMobile ? "h-11 w-full rounded-xl" : undefined}
            >
              {addingNickname ? "Saving..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingNickname)} onOpenChange={onEditingNicknameOpenChange}>
        <DialogContent
          className={isMobile ? "max-w-md rounded-[1.5rem] border-border/60 p-5 pt-6 shadow-2xl" : "max-w-md"}
          data-floating-ai-avoid="true"
        >
          <DialogHeader className={isMobile ? "pr-8 text-left" : undefined}>
            <DialogTitle>Edit Nickname</DialogTitle>
            <DialogDescription>Kemaskini nama nickname dan role scope akses nickname.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="collection-nickname-edit-value">Nickname</Label>
            <Input
              id="collection-nickname-edit-value"
              name="collectionNickname"
              value={editValue}
              onChange={(event) => onEditValueChange(event.target.value)}
              autoComplete="off"
              maxLength={64}
              className={isMobile ? "h-12 rounded-2xl" : undefined}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={editRoleScopeTriggerId}>Role Scope</Label>
            <Select value={editRoleScope} onValueChange={onEditRoleScopeChange}>
              <SelectTrigger id={editRoleScopeTriggerId} className={isMobile ? "h-12 rounded-2xl" : undefined}>
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
          <DialogFooter className={isMobile ? "gap-3 pt-2" : undefined}>
            <Button
              variant="outline"
              onClick={() => onEditingNicknameOpenChange(false)}
              disabled={savingEdit}
              className={isMobile ? "h-11 w-full rounded-xl" : undefined}
            >
              Batal
            </Button>
            <Button
              onClick={onSaveEditNickname}
              disabled={savingEdit}
              className={isMobile ? "h-11 w-full rounded-xl" : undefined}
            >
              {savingEdit ? "Saving..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
