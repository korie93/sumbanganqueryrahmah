import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  getLocalMailOutboxEmptyMessage,
  normalizeLocalMailOutboxSortDirection,
} from "@/pages/settings/account-management/local-mail-outbox-utils";
import { normalizeSearchValue } from "@/pages/settings/account-management/utils";
import type { DevMailOutboxPreview } from "@/pages/settings/types";
import type { DevMailOutboxQueryState } from "@/pages/settings/useSettingsDevMailOutbox";

type UseLocalMailOutboxStateArgs = {
  entries: DevMailOutboxPreview[];
  loading: boolean;
  onQueryChange: (query: Partial<DevMailOutboxQueryState>) => void;
  query: DevMailOutboxQueryState;
  total: number;
};

export function useLocalMailOutboxState({
  entries,
  loading,
  onQueryChange,
  query,
  total,
}: UseLocalMailOutboxStateArgs) {
  const [emailQuery, setEmailQuery] = useState(query.searchEmail);
  const [subjectQuery, setSubjectQuery] = useState(query.searchSubject);
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">(query.sortDirection);
  const [previewToDelete, setPreviewToDelete] = useState<DevMailOutboxPreview | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<DevMailOutboxPreview | null>(null);

  const deferredEmailQuery = useDeferredValue(emailQuery);
  const deferredSubjectQuery = useDeferredValue(subjectQuery);

  const normalizedDeferredEmailQuery = useMemo(
    () => normalizeSearchValue(deferredEmailQuery),
    [deferredEmailQuery],
  );
  const normalizedDeferredSubjectQuery = useMemo(
    () => normalizeSearchValue(deferredSubjectQuery),
    [deferredSubjectQuery],
  );

  const hasSearchFilter = normalizedDeferredEmailQuery.length > 0
    || normalizedDeferredSubjectQuery.length > 0;

  const emptyMessage = useMemo(
    () =>
      getLocalMailOutboxEmptyMessage({
        hasSearchFilter,
        loading,
        total,
      }),
    [hasSearchFilter, loading, total],
  );

  useEffect(() => {
    if (!previewEntry) return;
    if (entries.some((entry) => entry.id === previewEntry.id)) return;
    setPreviewEntry(null);
  }, [entries, previewEntry]);

  useEffect(() => {
    const normalizedEmailFromQuery = normalizeSearchValue(query.searchEmail);
    if (normalizeSearchValue(emailQuery) !== normalizedEmailFromQuery) {
      setEmailQuery(query.searchEmail);
    }
  }, [emailQuery, query.searchEmail]);

  useEffect(() => {
    const normalizedSubjectFromQuery = normalizeSearchValue(query.searchSubject);
    if (normalizeSearchValue(subjectQuery) !== normalizedSubjectFromQuery) {
      setSubjectQuery(query.searchSubject);
    }
  }, [query.searchSubject, subjectQuery]);

  useEffect(() => {
    if (sortDirection !== query.sortDirection) {
      setSortDirection(query.sortDirection);
    }
  }, [query.sortDirection, sortDirection]);

  useEffect(() => {
    if (
      normalizedDeferredEmailQuery === normalizeSearchValue(query.searchEmail)
      && normalizedDeferredSubjectQuery === normalizeSearchValue(query.searchSubject)
    ) {
      return;
    }
    onQueryChange({
      page: 1,
      searchEmail: normalizedDeferredEmailQuery,
      searchSubject: normalizedDeferredSubjectQuery,
    });
  }, [
    normalizedDeferredEmailQuery,
    normalizedDeferredSubjectQuery,
    onQueryChange,
    query.searchEmail,
    query.searchSubject,
  ]);

  const copyPreviewLink = async (previewUrl: string) => {
    if (!navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(previewUrl);
  };

  return {
    clearAllOpen,
    emailQuery,
    emptyMessage,
    previewEntry,
    previewToDelete,
    sortDirection,
    subjectQuery,
    closeDeleteDialog: () => {
      setPreviewToDelete(null);
    },
    closePreviewDialog: () => {
      setPreviewEntry(null);
    },
    copyPreviewLink,
    onEmailQueryChange: (value: string) => {
      setEmailQuery(value);
    },
    onSortDirectionChange: (value: string) => {
      const nextSortDirection = normalizeLocalMailOutboxSortDirection(value);
      setSortDirection(nextSortDirection);
      onQueryChange({
        page: 1,
        sortDirection: nextSortDirection,
      });
    },
    onSubjectQueryChange: (value: string) => {
      setSubjectQuery(value);
    },
    openClearAllDialog: () => {
      setClearAllOpen(true);
    },
    openDeleteDialog: (entry: DevMailOutboxPreview) => {
      setPreviewToDelete(entry);
    },
    openPreviewDialog: (entry: DevMailOutboxPreview) => {
      setPreviewEntry(entry);
    },
    setClearAllOpen,
  };
}
