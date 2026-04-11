import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearSaveCollectionDraft,
  persistSaveCollectionDraft,
  readSaveCollectionDraft,
} from "@/pages/collection/save-collection-draft";
import {
  formatSaveCollectionRestoreNoticeLabel,
  type SaveCollectionDraftRestoreNotice,
  type SaveCollectionFormValues,
} from "@/pages/collection/save-collection-page-utils";
import {
  buildSaveCollectionDraftPersistPayload,
  buildSaveCollectionDraftRestoreState,
  type SaveCollectionRestoredFormValues,
} from "@/pages/collection/save-collection-state-utils";

const SAVE_COLLECTION_DRAFT_PERSIST_DELAY_MS = 250;

type UseSaveCollectionDraftStateOptions = {
  staffNickname: string;
  values: SaveCollectionFormValues;
  hasPendingReceipts: boolean;
  applyRestoredFormValues: (values: SaveCollectionRestoredFormValues) => void;
};

export function useSaveCollectionDraftState({
  staffNickname,
  values,
  hasPendingReceipts,
  applyRestoredFormValues,
}: UseSaveCollectionDraftStateOptions) {
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftRestoreNotice, setDraftRestoreNotice] = useState<SaveCollectionDraftRestoreNotice | null>(null);

  const persistPayload = useMemo(
    () => buildSaveCollectionDraftPersistPayload(values, hasPendingReceipts),
    [hasPendingReceipts, values],
  );

  useEffect(() => {
    const restored = buildSaveCollectionDraftRestoreState(readSaveCollectionDraft(staffNickname));
    applyRestoredFormValues(restored.values);
    setDraftRestoreNotice(restored.notice);
    setDraftHydrated(true);
  }, [applyRestoredFormValues, staffNickname]);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    const timer = window.setTimeout(() => {
      persistSaveCollectionDraft(staffNickname, persistPayload);
    }, SAVE_COLLECTION_DRAFT_PERSIST_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draftHydrated, persistPayload, staffNickname]);

  const restoreNoticeLabel = useMemo(
    () => formatSaveCollectionRestoreNoticeLabel(draftRestoreNotice?.restoredAt),
    [draftRestoreNotice?.restoredAt],
  );

  const clearDraftState = useCallback(() => {
    clearSaveCollectionDraft(staffNickname);
    setDraftRestoreNotice(null);
  }, [staffNickname]);

  return {
    draftRestoreNotice,
    restoreNoticeLabel,
    clearDraftState,
  };
}
