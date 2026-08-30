import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCollectionSourceMatches,
  type CollectionSourceMatch,
} from "@/lib/api";

type CollectionSourceIdentity = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
};

function isAbortError(error: unknown) {
  return typeof DOMException !== "undefined"
    && error instanceof DOMException
    && error.name === "AbortError";
}

export function useCollectionSourceMatching(
  identity: CollectionSourceIdentity,
  onSelectionChange: (sourceImportId: string) => void,
) {
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const [matches, setMatches] = useState<CollectionSourceMatch[]>([]);
  const [selectedImportId, setSelectedImportId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const identityFingerprint = useMemo(() => JSON.stringify({
    customerName: identity.customerName.trim(),
    icNumber: identity.icNumber.trim(),
    customerPhone: identity.customerPhone.trim(),
    accountNumber: identity.accountNumber.trim(),
  }), [
    identity.accountNumber,
    identity.customerName,
    identity.customerPhone,
    identity.icNumber,
  ]);

  const resetMatches = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestIdRef.current += 1;
    setMatches([]);
    setSelectedImportId("");
    setLoading(false);
    setError("");
    setHasSearched(false);
    onSelectionChange("");
  }, [onSelectionChange]);

  useEffect(() => {
    resetMatches();
  }, [identityFingerprint, resetMatches]);

  useEffect(() => () => {
    controllerRef.current?.abort();
    requestIdRef.current += 1;
  }, []);

  const selectMatch = useCallback((sourceImportId: string) => {
    const selected = matches.find((match) =>
      match.sourceImportId === sourceImportId && match.totalDue !== null);
    const nextId = selected?.sourceImportId ?? "";
    setSelectedImportId(nextId);
    onSelectionChange(nextId);
  }, [matches, onSelectionChange]);

  const runMatching = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    setHasSearched(false);

    try {
      const response = await getCollectionSourceMatches(identity, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setMatches(response.matches);
      setHasSearched(true);
      const preferred = response.matches.find((match) => match.totalDue !== null) ?? null;
      const nextId = preferred?.sourceImportId ?? "";
      setSelectedImportId(nextId);
      onSelectionChange(nextId);
    } catch (matchingError: unknown) {
      if (controller.signal.aborted || requestId !== requestIdRef.current || isAbortError(matchingError)) {
        return;
      }
      setMatches([]);
      setSelectedImportId("");
      setHasSearched(true);
      onSelectionChange("");
      setError(matchingError instanceof Error
        ? matchingError.message
        : "Saved source matching failed.");
    } finally {
      if (!controller.signal.aborted && requestId === requestIdRef.current) {
        setLoading(false);
        controllerRef.current = null;
      }
    }
  }, [
    identity.accountNumber,
    identity.customerName,
    identity.customerPhone,
    identity.icNumber,
    onSelectionChange,
  ]);

  const selectedMatch = useMemo(
    () => matches.find((match) => match.sourceImportId === selectedImportId) ?? null,
    [matches, selectedImportId],
  );

  return {
    error,
    hasSearched,
    loading,
    matches,
    selectedImportId,
    selectedMatch,
    resetMatches,
    runMatching,
    selectMatch,
  };
}
