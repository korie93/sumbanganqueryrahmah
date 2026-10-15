import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import {
  getLocalMailOutboxEmptyState,
  getLocalMailOutboxEmptyMessage,
  normalizeLocalMailOutboxSortDirection,
} from "@/pages/settings/account-management/local-mail-outbox-utils";
import {
  ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
  normalizeSearchValue,
} from "@/pages/settings/account-management/utils";
import { getAccountManagementSearchSync } from "./account-management-search-sync";
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
  const previousAppliedEmail = useRef(query.searchEmail);
  const previousAppliedSubject = useRef(query.searchSubject);
  const lastSubmittedEmail = useRef<string | null>(null);
  const lastSubmittedSubject = useRef<string | null>(null);
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
  const emailSync = getAccountManagementSearchSync({
    appliedSearch: query.searchEmail,
    previousAppliedSearch: previousAppliedEmail.current,
    lastSubmittedSearch: lastSubmittedEmail.current,
    draftSearch: emailQuery,
    deferredSearch: deferredEmailQuery,
  });
  const subjectSync = getAccountManagementSearchSync({
    appliedSearch: query.searchSubject,
    previousAppliedSearch: previousAppliedSubject.current,
    lastSubmittedSearch: lastSubmittedSubject.current,
    draftSearch: subjectQuery,
    deferredSearch: deferredSubjectQuery,
  });
  // The server query applies both fields together, so neither may publish a stale deferred draft.
  const canPublishSearch = !emailSync.resetDraft && !subjectSync.resetDraft
    && normalizedDeferredEmailQuery === normalizeSearchValue(emailQuery)
    && normalizedDeferredSubjectQuery === normalizeSearchValue(subjectQuery)
    && (emailSync.publishSearch !== null || subjectSync.publishSearch !== null);

  const hasSearchFilter = normalizedDeferredEmailQuery.length > 0
    || normalizedDeferredSubjectQuery.length > 0;

  const activeFilters = useMemo<ActiveFilterChip[]>(
    () => {
      const chips: Array<ActiveFilterChip | null> = [
        normalizedDeferredEmailQuery
          ? {
              id: "local-mail-email",
              label: `Email: ${deferredEmailQuery.trim()}`,
              onRemove: () => setEmailQuery(""),
            }
          : null,
        normalizedDeferredSubjectQuery
          ? {
              id: "local-mail-subject",
              label: `Subject: ${deferredSubjectQuery.trim()}`,
              onRemove: () => setSubjectQuery(""),
            }
          : null,
      ];

      return chips.filter((item): item is ActiveFilterChip => item !== null);
    },
    [
      deferredEmailQuery,
      deferredSubjectQuery,
      normalizedDeferredEmailQuery,
      normalizedDeferredSubjectQuery,
    ],
  );

  const emptyMessage = useMemo(
    () =>
      getLocalMailOutboxEmptyMessage({
        hasSearchFilter,
        loading,
        total,
      }),
    [hasSearchFilter, loading, total],
  );

  const emptyState = useMemo(
    () =>
      getLocalMailOutboxEmptyState({
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
    if (previousAppliedEmail.current !== query.searchEmail) lastSubmittedEmail.current = null;
    previousAppliedEmail.current = query.searchEmail;
    if (emailSync.resetDraft) setEmailQuery(query.searchEmail);
  }, [emailSync.resetDraft, query.searchEmail]);

  useEffect(() => {
    if (previousAppliedSubject.current !== query.searchSubject) lastSubmittedSubject.current = null;
    previousAppliedSubject.current = query.searchSubject;
    if (subjectSync.resetDraft) setSubjectQuery(query.searchSubject);
  }, [query.searchSubject, subjectSync.resetDraft]);

  useEffect(() => {
    setSortDirection(query.sortDirection);
  }, [query.sortDirection]);

  useEffect(() => {
    if (!canPublishSearch) return;
    lastSubmittedEmail.current = normalizedDeferredEmailQuery;
    lastSubmittedSubject.current = normalizedDeferredSubjectQuery;
    onQueryChange({
      page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
      searchEmail: normalizedDeferredEmailQuery,
      searchSubject: normalizedDeferredSubjectQuery,
    });
  }, [
    normalizedDeferredEmailQuery,
    normalizedDeferredSubjectQuery,
    canPublishSearch,
    onQueryChange,
  ]);

  const copyPreviewLink = async (previewUrl: string) => {
    if (!navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(previewUrl);
  };

  return {
    activeFilters,
    clearAllOpen,
    emailQuery,
    emptyMessage,
    emptyState,
    hasSearchFilter,
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
    clearSearchFilters: () => {
      setEmailQuery("");
      setSubjectQuery("");
      onQueryChange({
        page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
        searchEmail: "",
        searchSubject: "",
      });
    },
    onEmailQueryChange: (value: string) => {
      setEmailQuery(value);
    },
    onSortDirectionChange: (value: string) => {
      const nextSortDirection = normalizeLocalMailOutboxSortDirection(value);
      setSortDirection(nextSortDirection);
      onQueryChange({
        page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
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
