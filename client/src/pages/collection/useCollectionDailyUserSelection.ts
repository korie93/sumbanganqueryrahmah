import { useCallback, useEffect, useMemo, useState } from "react";
import type { CollectionDailyUser } from "@/lib/api";

type UseCollectionDailyUserSelectionOptions = {
  canManage: boolean;
  currentUsername: string;
  users: CollectionDailyUser[];
};

export function reconcileCollectionDailySelectedUsers(
  previous: string[],
  users: CollectionDailyUser[],
) {
  const available = new Set(users.map((item) => item.username.toLowerCase()));
  const kept = previous.filter((value) => available.has(value.toLowerCase()));
  if (kept.length > 0) {
    return kept;
  }
  if (users.length > 0) {
    return [users[0].username.toLowerCase()];
  }
  return [];
}

export function formatCollectionDailySelectedUsersLabel(options: {
  canManage: boolean;
  currentUsername: string;
  selectedUsernames: string[];
  users: CollectionDailyUser[];
}) {
  const { canManage, currentUsername, selectedUsernames, users } = options;
  if (!canManage) return currentUsername || "-";
  if (selectedUsernames.length === 0) return "Select users";
  if (selectedUsernames.length === 1) {
    const matched = users.find(
      (item) => item.username.toLowerCase() === selectedUsernames[0],
    );
    return matched ? `${matched.username} (${matched.role})` : selectedUsernames[0];
  }
  return `${selectedUsernames.length} users selected`;
}

export function useCollectionDailyUserSelection({
  canManage,
  currentUsername,
  users,
}: UseCollectionDailyUserSelectionOptions) {
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);

  useEffect(() => {
    if (!canManage) {
      setSelectedUsernames(currentUsername ? [currentUsername] : []);
    }
  }, [canManage, currentUsername]);

  useEffect(() => {
    if (!canManage) return;
    setSelectedUsernames((previous) => {
      return reconcileCollectionDailySelectedUsers(previous, users);
    });
  }, [canManage, users]);

  const selectedUserSet = useMemo(
    () => new Set(selectedUsernames.map((value) => value.toLowerCase())),
    [selectedUsernames],
  );

  const allUsersSelected =
    canManage && users.length > 0 && selectedUserSet.size === users.length;
  const partiallySelected =
    canManage && selectedUserSet.size > 0 && !allUsersSelected;
  const canEditTarget = canManage && selectedUsernames.length === 1;

  const selectedUsersLabel = useMemo(
    () =>
      formatCollectionDailySelectedUsersLabel({
        canManage,
        currentUsername,
        selectedUsernames,
        users,
      }),
    [canManage, currentUsername, selectedUsernames, users],
  );

  const selectedQueryUsers = useMemo(
    () => (canManage ? selectedUsernames : undefined),
    [canManage, selectedUsernames],
  );

  const toggleSelectedUser = useCallback((username: string, checked: boolean) => {
    const normalized = username.toLowerCase();
    setSelectedUsernames((previous) => {
      const nextSet = new Set(previous.map((value) => value.toLowerCase()));
      if (checked) nextSet.add(normalized);
      else nextSet.delete(normalized);
      return Array.from(nextSet);
    });
  }, []);

  const selectAllUsers = useCallback(() => {
    setSelectedUsernames(users.map((item) => item.username.toLowerCase()));
  }, [users]);

  const clearSelectedUsers = useCallback(() => {
    setSelectedUsernames([]);
  }, []);

  return {
    selectedUsernames,
    selectedUserSet,
    allUsersSelected,
    partiallySelected,
    canEditTarget,
    selectedUsersLabel,
    selectedQueryUsers,
    userPopoverOpen,
    setUserPopoverOpen,
    selectedUsernamesCount: selectedUsernames.length,
    toggleSelectedUser,
    selectAllUsers,
    clearSelectedUsers,
  };
}
