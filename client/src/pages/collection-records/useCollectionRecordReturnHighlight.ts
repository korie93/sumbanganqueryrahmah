import { useCallback, useEffect, useState } from "react";

type ReturnMarker = { recordId: string; contextKey: string };
type VisibleRecord = { id: string };

export function resolveCollectionRecordReturnMarker(
  marker: ReturnMarker | null,
  contextKey: string,
  records: readonly VisibleRecord[],
): ReturnMarker | null {
  return marker && marker.contextKey === contextKey && records.some((record) => record.id === marker.recordId)
    ? marker : null;
}

// Page-local navigation context only: never persist customer identities or
// restore a marker into a different result set, account role or page.
export function useCollectionRecordReturnHighlight(contextKey: string, records: readonly VisibleRecord[]) {
  const [marker, setMarker] = useState<ReturnMarker | null>(null);
  const currentMarker = resolveCollectionRecordReturnMarker(marker, contextKey, records);

  useEffect(() => {
    setMarker((previous) => resolveCollectionRecordReturnMarker(previous, contextKey, records));
  }, [contextKey, records]);

  const markViewed = useCallback((recordId: string) => {
    setMarker(resolveCollectionRecordReturnMarker({ recordId, contextKey }, contextKey, records));
  }, [contextKey, records]);

  return { lastViewedRecordId: currentMarker?.recordId ?? null, markViewed };
}
