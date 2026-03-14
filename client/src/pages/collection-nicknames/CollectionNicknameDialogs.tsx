import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CollectionAdminGroup, CollectionStaffNickname } from "@/lib/api";
import { ROLE_SCOPE_OPTIONS, type PendingUngroup } from "@/pages/collection-nicknames/utils";

interface CollectionNicknameDialogsProps {
  leaderOptions: CollectionStaffNickname[];
  createGroupOpen: boolean;
  createLeaderId: string;
  creatingGroup: boolean;
  changeLeaderOpen: boolean;
  changeLeaderId: string;
  savingLeader: boolean;
  addOpen: boolean;
  newNickname: string;
  newRoleScope: "admin" | "user" | "both";
  addingNickname: boolean;
  editingNickname: CollectionStaffNickname | null;
  editValue: string;
  editRoleScope: "admin" | "user" | "both";
  savingEdit: boolean;
  pendingDeactivate: CollectionStaffNickname | null;
  statusBusyId: string | null;
  pendingDeleteGroup: CollectionAdminGroup | null;
  deletingGroup: boolean;
  pendingDeleteNickname: CollectionStaffNickname | null;
  deletingNicknameId: string | null;
  pendingResetPassword: CollectionStaffNickname | null;
  resettingNicknameId: string | null;
  pendingUngroup: PendingUngroup | null;
  ungrouping: boolean;
  confirmSwitchOpen: boolean;
  onCreateGroupOpenChange: (open: boolean) => void;
  onCreateLeaderIdChange: (value: string) => void;
  onCreateGroup: () => void;
  onChangeLeaderOpenChange: (open: boolean) => void;
  onChangeLeaderIdChange: (value: string) => void;
  onSaveLeader: () => void;
  onAddOpenChange: (open: boolean) => void;
  onNewNicknameChange: (value: string) => void;
  onNewRoleScopeChange: (value: "admin" | "user" | "both") => void;
  onCreateNickname: () => void;
  onEditingNicknameOpenChange: (open: boolean) => void;
  onEditValueChange: (value: string) => void;
  onEditRoleScopeChange: (value: "admin" | "user" | "both") => void;
  onSaveEditNickname: () => void;
  onPendingDeactivateOpenChange: (open: boolean) => void;
  onConfirmDeactivate: () => void;
  onPendingDeleteGroupOpenChange: (open: boolean) => void;
  onConfirmDeleteGroup: () => void;
  onPendingDeleteNicknameOpenChange: (open: boolean) => void;
  onConfirmDeleteNickname: () => void;
  onPendingResetPasswordOpenChange: (open: boolean) => void;
  onConfirmResetPassword: () => void;
  onPendingUngroupOpenChange: (open: boolean) => void;
  onConfirmUngroup: () => void;
  onConfirmSwitchOpenChange: (open: boolean) => void;
  onConfirmSwitch: () => void;
}

export function CollectionNicknameDialogs({
  leaderOptions,
  createGroupOpen,
  createLeaderId,
  creatingGroup,
  changeLeaderOpen,
  changeLeaderId,
  savingLeader,
  addOpen,
  newNickname,
  newRoleScope,
  addingNickname,
  editingNickname,
  editValue,
  editRoleScope,
  savingEdit,
  pendingDeactivate,
  statusBusyId,
  pendingDeleteGroup,
  deletingGroup,
  pendingDeleteNickname,
  deletingNicknameId,
  pendingResetPassword,
  resettingNicknameId,
  pendingUngroup,
  ungrouping,
  confirmSwitchOpen,
  onCreateGroupOpenChange,
  onCreateLeaderIdChange,
  onCreateGroup,
  onChangeLeaderOpenChange,
  onChangeLeaderIdChange,
  onSaveLeader,
  onAddOpenChange,
  onNewNicknameChange,
  onNewRoleScopeChange,
  onCreateNickname,
  onEditingNicknameOpenChange,
  onEditValueChange,
  onEditRoleScopeChange,
  onSaveEditNickname,
  onPendingDeactivateOpenChange,
  onConfirmDeactivate,
  onPendingDeleteGroupOpenChange,
  onConfirmDeleteGroup,
  onPendingDeleteNicknameOpenChange,
  onConfirmDeleteNickname,
  onPendingResetPasswordOpenChange,
  onConfirmResetPassword,
  onPendingUngroupOpenChange,
  onConfirmUngroup,
  onConfirmSwitchOpenChange,
  onConfirmSwitch,
}: CollectionNicknameDialogsProps) {
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
              placeholder="Contoh: SW.HAIZAL_1131"
              maxLength={64}
            />
          </div>
          <div className="space-y-2">
            <Label>Role Scope</Label>
            <Select value={newRoleScope} onValueChange={(value) => onNewRoleScopeChange(value as "admin" | "user" | "both")}>
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
            <Select value={editRoleScope} onValueChange={(value) => onEditRoleScopeChange(value as "admin" | "user" | "both")}>
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

      <Dialog open={Boolean(pendingDeactivate)} onOpenChange={onPendingDeactivateOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nyahaktif Nickname</DialogTitle>
            <DialogDescription>Adakah anda pasti mahu nyahaktif nickname ini?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onPendingDeactivateOpenChange(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDeactivate}
              disabled={!pendingDeactivate || statusBusyId === pendingDeactivate.id}
            >
              {pendingDeactivate && statusBusyId === pendingDeactivate.id ? "Processing..." : "Nyahaktif"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDeleteGroup)} onOpenChange={onPendingDeleteGroupOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam Admin Group</AlertDialogTitle>
            <AlertDialogDescription>Adakah anda pasti mahu padam group ini?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingGroup}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDeleteGroup} disabled={deletingGroup}>
              {deletingGroup ? "Processing..." : "Padam"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingDeleteNickname)} onOpenChange={onPendingDeleteNicknameOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam Nickname</AlertDialogTitle>
            <AlertDialogDescription>
              Jika nickname sedang digunakan, sistem akan nyahaktifkan secara selamat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingNicknameId)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDeleteNickname}
              disabled={!pendingDeleteNickname || Boolean(deletingNicknameId)}
            >
              {deletingNicknameId ? "Processing..." : "Padam"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingResetPassword)} onOpenChange={onPendingResetPasswordOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password Nickname</AlertDialogTitle>
            <AlertDialogDescription>Adakah anda pasti mahu reset password nickname ini?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(resettingNicknameId)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmResetPassword}
              disabled={!pendingResetPassword || Boolean(resettingNicknameId)}
            >
              {resettingNicknameId ? "Processing..." : "Reset Password"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingUngroup)} onOpenChange={onPendingUngroupOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ungroup Nickname</AlertDialogTitle>
            <AlertDialogDescription>
              Adakah anda pasti mahu buang nickname ini daripada grouping admin ini?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmUngroup} disabled={ungrouping}>
              {ungrouping ? "Processing..." : "Buang"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSwitchOpen} onOpenChange={onConfirmSwitchOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Perubahan Belum Disimpan</AlertDialogTitle>
            <AlertDialogDescription>
              Perubahan belum disimpan. Adakah anda mahu teruskan tanpa simpan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmSwitch}>Teruskan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
