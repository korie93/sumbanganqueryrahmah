import { useCallback, useMemo, useRef, useState } from "react";
import type { ManagedUser, ManagedUserSaveError } from "@/pages/settings/types";
import type { ManageableUserRole } from "@shared/user-roles";

export function useSettingsManagedDialogs() {
  const [managedDialogOpen, setManagedDialogOpen] = useState(false);
  const [managedSelectedUser, setManagedSelectedUser] = useState<ManagedUser | null>(null);
  const [managedFullNameInput, setManagedFullNameInput] = useState("");
  const [managedEmailInput, setManagedEmailInput] = useState("");
  const [managedUsernameInput, setManagedUsernameInput] = useState("");
  const [managedRoleInput, setManagedRoleInput] = useState<ManageableUserRole>("user");
  const [managedStatusInput, setManagedStatusInput] = useState<
    "pending_activation" | "active" | "suspended" | "disabled"
  >("active");
  const [managedIsBanned, setManagedIsBanned] = useState(false);
  const [managedSaving, setManagedSaving] = useState(false);
  const [managedSaveError, setManagedSaveError] = useState<ManagedUserSaveError | null>(null);
  const editorSessionRef = useRef(0);
  // Increment synchronously on open AND close. Account IDs alone cannot protect
  // a close/reopen of the same account from an older request's feedback.
  const publishManagedSaveError = useCallback((session: number, error: ManagedUserSaveError | null) => {
    if (editorSessionRef.current !== session) return false;
    setManagedSaveError(error);
    return true;
  }, []);
  const managedEditorFeedback = useMemo(() => ({
    sessionRef: editorSessionRef, publishError: publishManagedSaveError,
  }), [publishManagedSaveError]);
  const [managedSecretDialogOpen, setManagedSecretDialogOpen] = useState(false);
  const [managedSecretDialogTitle, setManagedSecretDialogTitle] = useState("");
  const [managedSecretDialogDescription, setManagedSecretDialogDescription] = useState("");
  const [managedSecretDialogValue, setManagedSecretDialogValue] = useState("");

  const openManagedEditor = useCallback((user: ManagedUser) => {
    editorSessionRef.current += 1;
    setManagedSaveError(null);
    setManagedSelectedUser(user);
    setManagedFullNameInput(user.fullName || "");
    setManagedEmailInput(user.email || "");
    setManagedUsernameInput(user.username);
    setManagedRoleInput(
      user.role === "admin" || user.role === "manager" ? user.role : "user",
    );
    setManagedStatusInput(
      (user.status as "pending_activation" | "active" | "suspended" | "disabled") || "active",
    );
    setManagedIsBanned(Boolean(user.isBanned));
    setManagedDialogOpen(true);
  }, []);

  const handleManagedDialogChange = useCallback((open: boolean) => {
    editorSessionRef.current += 1;
    setManagedSaveError(null);
    setManagedDialogOpen(open);
    if (!open) {
      setManagedSelectedUser(null);
      setManagedFullNameInput("");
      setManagedEmailInput("");
      setManagedUsernameInput("");
      setManagedRoleInput("user");
      setManagedStatusInput("active");
      setManagedIsBanned(false);
    }
  }, []);

  const openManagedSecretDialog = useCallback((params: {
    title: string;
    description: string;
    value?: string | undefined;
  }) => {
    setManagedSecretDialogTitle(params.title);
    setManagedSecretDialogDescription(params.description);
    setManagedSecretDialogValue(params.value || "");
    setManagedSecretDialogOpen(true);
  }, []);

  return {
    handleManagedDialogChange,
    managedDialogOpen,
    managedEmailInput,
    managedEditorFeedback,
    managedFullNameInput,
    managedIsBanned,
    managedRoleInput,
    managedSaving,
    managedSaveError,
    managedSecretDialogDescription,
    managedSecretDialogOpen,
    managedSecretDialogTitle,
    managedSecretDialogValue,
    managedSelectedUser,
    managedStatusInput,
    managedUsernameInput,
    openManagedEditor,
    openManagedSecretDialog,
    setManagedEmailInput,
    setManagedFullNameInput,
    setManagedIsBanned,
    setManagedRoleInput,
    setManagedSaving,
    setManagedSecretDialogOpen,
    setManagedStatusInput,
    setManagedUsernameInput,
  };
}
