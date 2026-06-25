import { useCallback, useMemo, useState } from "react";
import {
  getDefaultActivityColumnPreferences,
  getVisibleActivityColumns,
  moveActivityColumn,
  readActivityColumnPreferences,
  toggleActivityColumn,
  writeActivityColumnPreferences,
  type ActivityColumnId,
} from "@/pages/activity/activity-column-preferences";

export function useActivityColumnPreferences() {
  const [preferences, setPreferences] = useState(readActivityColumnPreferences);

  const updatePreferences = useCallback(
    (
      updater: (
        previous: ReturnType<typeof getDefaultActivityColumnPreferences>,
      ) => ReturnType<typeof getDefaultActivityColumnPreferences>,
    ) => {
      setPreferences((previous) => {
        const next = updater(previous);
        if (next !== previous) {
          writeActivityColumnPreferences(next);
        }
        return next;
      });
    },
    [],
  );

  const toggleColumn = useCallback(
    (column: ActivityColumnId) => {
      updatePreferences((previous) => toggleActivityColumn(previous, column));
    },
    [updatePreferences],
  );

  const moveColumn = useCallback(
    (column: ActivityColumnId, direction: -1 | 1) => {
      updatePreferences((previous) => moveActivityColumn(previous, column, direction));
    },
    [updatePreferences],
  );

  const resetColumns = useCallback(() => {
    updatePreferences(() => getDefaultActivityColumnPreferences());
  }, [updatePreferences]);

  const visibleColumns = useMemo(
    () => getVisibleActivityColumns(preferences),
    [preferences],
  );

  return {
    preferences,
    visibleColumns,
    moveColumn,
    resetColumns,
    toggleColumn,
  };
}
