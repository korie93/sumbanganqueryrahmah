import { useCallback, useState } from "react";
import type { ManagedUser } from "@/pages/settings/types";

export function useSettingsManagedDialogs() {
  const [managedDialogOpen, setManagedDialogOpen] = useState(false);
  const [managedSelectedUser, setManagedSelectedUser] = useState<ManagedUser | null>(null);
  const [managedFullNameInput, setManagedFullNameInput] = useState("");
  const [managedEmailInput, setManagedEmailInput] = useState("");
  const [managedUsernameInput, setManagedUsernameInput] = useState("");
  const [managedRoleInput, setManagedRoleInput] = useState<"admin" | "user">("user");
  const [managedStatusInput, setManagedStatusInput] = useState<
    "pending_activation" | "active" | "suspended" | "disabled"
  >("active");
  const [managedIsBanned, setManagedIsBanned] = useState(false);
  const [managedSaving, setManagedSaving] = useState(false);
  const [managedSecretDialogOpen, setManagedSecretDialogOpen] = useState(false);
  const [managedSecretDialogTitle, setManagedSecretDialogTitle] = useState("");
  const [managedSecretDialogDescription, setManagedSecretDialogDescription] = useState("");
  const [managedSecretDialogValue, setManagedSecretDialogValue] = useState("");

  const openManagedEditor = useCallback((user: ManagedUser) => {
    setManagedSelectedUser(user);
    setManagedFullNameInput(user.fullName || "");
    setManagedEmailInput(user.email || "");
    setManagedUsernameInput(user.username);
    setManagedRoleInput(user.role === "admin" ? "admin" : "user");
    setManagedStatusInput(
      (user.status as "pending_activation" | "active" | "suspended" | "disabled") || "active",
    );
    setManagedIsBanned(Boolean(user.isBanned));
    setManagedDialogOpen(true);
  }, []);

  const handleManagedDialogChange = useCallback((open: boolean) => {
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
    managedFullNameInput,
    managedIsBanned,
    managedRoleInput,
    managedSaving,
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
