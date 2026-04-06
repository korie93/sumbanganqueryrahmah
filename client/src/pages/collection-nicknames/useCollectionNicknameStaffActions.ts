import { useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  createCollectionNickname,
  deleteCollectionNickname,
  resetCollectionNicknamePassword,
  setCollectionNicknameStatus,
  type CollectionStaffNickname,
  updateCollectionNickname,
} from "@/lib/api";
import { parseApiError } from "@/pages/collection/utils";
import type { CollectionNicknameActionOptions } from "@/pages/collection-nicknames/collection-nickname-actions-shared";
import {
  buildNicknamePasswordResetDescription,
  normalizeCollectionNicknameInput,
} from "@/pages/collection-nicknames/collection-nickname-actions-utils";

export function useCollectionNicknameStaffActions({
  nicknameData,
  dialogs,
  onNicknameListChanged,
}: CollectionNicknameActionOptions) {
  const { toast } = useToast();

  const createNicknameRef = useRef(false);
  const saveEditNicknameRef = useRef(false);
  const confirmResetPasswordRef = useRef(false);

  const createNickname = async () => {
    if (dialogs.addingNickname || createNicknameRef.current) return;
    const nickname = normalizeCollectionNicknameInput(dialogs.newNickname);
    if (!nickname) {
      toast({
        title: "Validation Error",
        description: "Nickname mesti sekurang-kurangnya 2 aksara.",
        variant: "destructive",
      });
      return;
    }
    createNicknameRef.current = true;
    dialogs.setAddingNickname(true);
    try {
      await createCollectionNickname({ nickname, roleScope: dialogs.newRoleScope });
      dialogs.setNewNickname("");
      dialogs.setNewRoleScope("both");
      dialogs.setAddOpen(false);
      toast({
        title: "Nickname Created",
        description: "Nickname baru berjaya ditambah.",
      });
      await nicknameData.reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Create Nickname",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      createNicknameRef.current = false;
      dialogs.setAddingNickname(false);
    }
  };

  const saveEditNickname = async () => {
    if (!dialogs.editingNickname || dialogs.savingEdit || saveEditNicknameRef.current) return;
    const nickname = normalizeCollectionNicknameInput(dialogs.editValue);
    if (!nickname) {
      toast({
        title: "Validation Error",
        description: "Nickname mesti sekurang-kurangnya 2 aksara.",
        variant: "destructive",
      });
      return;
    }
    saveEditNicknameRef.current = true;
    dialogs.setSavingEdit(true);
    try {
      await updateCollectionNickname(dialogs.editingNickname.id, {
        nickname,
        roleScope: dialogs.editRoleScope,
      });
      dialogs.setEditingNickname(null);
      toast({
        title: "Nickname Updated",
        description: "Nickname berjaya dikemaskini.",
      });
      await nicknameData.reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Update Nickname",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      saveEditNicknameRef.current = false;
      dialogs.setSavingEdit(false);
    }
  };

  const updateStatus = async (item: CollectionStaffNickname, isActive: boolean) => {
    if (dialogs.statusBusyId) return;
    dialogs.setStatusBusyId(item.id);
    try {
      await setCollectionNicknameStatus(item.id, isActive);
      toast({
        title: isActive ? "Nickname Activated" : "Nickname Deactivated",
        description: item.nickname,
      });
      await nicknameData.reloadData();
      onNicknameListChanged?.();
      dialogs.setPendingDeactivate(null);
    } catch (error: unknown) {
      toast({
        title: "Failed to Update Status",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      dialogs.setStatusBusyId(null);
    }
  };

  const deleteNickname = async () => {
    if (!dialogs.pendingDeleteNickname || dialogs.deletingNicknameId) return;
    const target = dialogs.pendingDeleteNickname;
    dialogs.setDeletingNicknameId(target.id);
    try {
      await deleteCollectionNickname(target.id);
      dialogs.setPendingDeleteNickname(null);
      toast({
        title: "Nickname Updated",
        description: `${target.nickname} berjaya diproses.`,
      });
      await nicknameData.reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Delete Nickname",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      dialogs.setDeletingNicknameId(null);
    }
  };

  const confirmResetPassword = async () => {
    if (!dialogs.pendingResetPassword || dialogs.resettingNicknameId || confirmResetPasswordRef.current) return;
    const target = dialogs.pendingResetPassword;
    confirmResetPasswordRef.current = true;
    dialogs.setResettingNicknameId(target.id);
    try {
      const response = await resetCollectionNicknamePassword(target.id);
      const temporaryPassword = String(response?.temporaryPassword || "").trim();
      dialogs.setPendingResetPassword(null);
      toast({
        title: "Password Nickname Direset",
        description: buildNicknamePasswordResetDescription({
          nickname: target.nickname,
          temporaryPassword,
        }),
      });
    } catch (error: unknown) {
      toast({
        title: "Failed to Reset Password",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      confirmResetPasswordRef.current = false;
      dialogs.setResettingNicknameId(null);
    }
  };

  return {
    createNickname,
    saveEditNickname,
    updateStatus,
    deleteNickname,
    confirmResetPassword,
  };
}
