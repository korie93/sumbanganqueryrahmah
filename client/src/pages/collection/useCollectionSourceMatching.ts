import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCollectionSavedSourceFiles,
  getCollectionSourceMatches,
  type CollectionSavedSourceFile,
  type CollectionSourceMatch,
} from "@/lib/api";
import { resolveMutationErrorMessage } from "@/lib/mutation-feedback";
import {
  type SaveCollectionFieldErrors,
  validateSaveCollectionIdentityFields,
} from "@/pages/collection/save-collection-page-utils";
import { isFutureDate, isPositiveAmount, isValidDate } from "@/pages/collection/utils";

type CollectionSourceMatchingInput = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  paymentDate: string;
  amount: string;
};

function isAbortError(error: unknown) {
  return typeof DOMException !== "undefined"
    && error instanceof DOMException
    && error.name === "AbortError";
}

export function useCollectionSourceMatching(
  identity: CollectionSourceMatchingInput,
  onSelectionChange: (sourceImportId: string) => void,
  onValidationErrors?: (errors: SaveCollectionFieldErrors) => void,
) {
  const matchingControllerRef = useRef<AbortController | null>(null);
  const matchingRequestIdRef = useRef(0);
  const sourceFilesRequestIdRef = useRef(0);
  const [matches, setMatches] = useState<CollectionSourceMatch[]>([]);
  const [selectedImportId, setSelectedImportId] = useState("");
  const [selectedSourceFile, setSelectedSourceFile] = useState<CollectionSavedSourceFile | null>(null);
  const [sourceFiles, setSourceFiles] = useState<CollectionSavedSourceFile[]>([]);
  const [sourceFilesTotal, setSourceFilesTotal] = useState(0);
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceFilesReloadToken, setSourceFilesReloadToken] = useState(0);
  const [sourceFilesLoading, setSourceFilesLoading] = useState(true);
  const [sourceFilesError, setSourceFilesError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const selectedSourceFileId = selectedSourceFile?.id ?? "";
  const identityFingerprint = useMemo(() => JSON.stringify({
    customerName: identity.customerName.trim(),
    icNumber: identity.icNumber.trim(),
    customerPhone: identity.customerPhone.trim(),
    accountNumber: identity.accountNumber.trim(),
    paymentDate: identity.paymentDate.trim(),
    amount: identity.amount.trim(),
  }), [
    identity.accountNumber,
    identity.amount,
    identity.customerName,
    identity.customerPhone,
    identity.icNumber,
    identity.paymentDate,
  ]);
  const identityFingerprintRef = useRef(identityFingerprint);
  identityFingerprintRef.current = identityFingerprint;

  const invalidateVerifiedMatch = useCallback(() => {
    matchingControllerRef.current?.abort();
    matchingControllerRef.current = null;
    matchingRequestIdRef.current += 1;
    setMatches([]);
    setSelectedImportId("");
    setLoading(false);
    setError("");
    setHasSearched(false);
    onSelectionChange("");
  }, [onSelectionChange]);

  const resetMatches = useCallback(() => {
    invalidateVerifiedMatch();
    setSelectedSourceFile(null);
    setSourceSearch("");
    setSourceFilesError("");
  }, [invalidateVerifiedMatch]);

  useEffect(() => {
    invalidateVerifiedMatch();
  }, [identityFingerprint, invalidateVerifiedMatch]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++sourceFilesRequestIdRef.current;
    const delayMs = sourceSearch.trim() ? 250 : 0;
    setSourceFilesLoading(true);
    setSourceFilesError("");

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await getCollectionSavedSourceFiles({
            limit: 100,
            search: sourceSearch.trim(),
          }, {
            signal: controller.signal,
          });
          if (controller.signal.aborted || requestId !== sourceFilesRequestIdRef.current) return;
          setSourceFiles(response.sourceFiles);
          setSourceFilesTotal(response.pagination.total);
          setSelectedSourceFile((current) => {
            if (!current) return null;
            return response.sourceFiles.find((item) => item.id === current.id) ?? current;
          });
        } catch (sourceFilesLoadError: unknown) {
          if (
            controller.signal.aborted
            || requestId !== sourceFilesRequestIdRef.current
            || isAbortError(sourceFilesLoadError)
          ) {
            return;
          }
          setSourceFiles([]);
          setSourceFilesTotal(0);
          setSourceFilesError(resolveMutationErrorMessage(
            sourceFilesLoadError,
            "Senarai fail Saved tidak dapat dimuatkan. Cuba lagi sebentar.",
          ));
        } finally {
          if (!controller.signal.aborted && requestId === sourceFilesRequestIdRef.current) {
            setSourceFilesLoading(false);
          }
        }
      })();
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [sourceFilesReloadToken, sourceSearch]);

  useEffect(() => () => {
    matchingControllerRef.current?.abort();
    matchingRequestIdRef.current += 1;
    sourceFilesRequestIdRef.current += 1;
  }, []);

  const selectSourceFile = useCallback((sourceImportId: string) => {
    const nextSource = sourceFiles.find((sourceFile) => sourceFile.id === sourceImportId) ?? null;
    invalidateVerifiedMatch();
    setSelectedSourceFile(nextSource);
  }, [invalidateVerifiedMatch, sourceFiles]);

  const runMatching = useCallback(async () => {
    const validationErrors = validateSaveCollectionIdentityFields(identity);
    if (!isValidDate(identity.paymentDate) || isFutureDate(identity.paymentDate)) {
      validationErrors.paymentDate = !isValidDate(identity.paymentDate)
        ? "Payment Date is invalid."
        : "Payment Date cannot be in the future.";
    }
    if (!isPositiveAmount(identity.amount)) {
      validationErrors.amount = "Amount must be greater than 0.";
    }
    if (!selectedSourceFileId) {
      validationErrors.sourceImportId = "Pilih fail Saved sebelum semak matching.";
    }
    if (Object.keys(validationErrors).length > 0) {
      invalidateVerifiedMatch();
      onValidationErrors?.(validationErrors);
      setError("Lengkapkan fail Saved dan maklumat collection yang ditanda sebelum semak matching.");
      return;
    }

    onValidationErrors?.({});
    matchingControllerRef.current?.abort();
    const controller = new AbortController();
    matchingControllerRef.current = controller;
    const requestId = ++matchingRequestIdRef.current;
    const requestFingerprint = identityFingerprint;
    setLoading(true);
    setError("");
    setHasSearched(false);
    setMatches([]);
    setSelectedImportId("");
    onSelectionChange("");

    try {
      const response = await getCollectionSourceMatches(identity, selectedSourceFileId, {
        signal: controller.signal,
      });
      if (
        controller.signal.aborted
        || requestId !== matchingRequestIdRef.current
        || requestFingerprint !== identityFingerprintRef.current
      ) return;
      const verifiedMatch = response.matches.find((match) => (
        match.sourceImportId === selectedSourceFileId
      )) ?? null;
      setMatches(verifiedMatch ? [verifiedMatch] : []);
      setHasSearched(true);
      const nextId = verifiedMatch?.sourceImportId ?? "";
      setSelectedImportId(nextId);
      onSelectionChange(nextId);
      if (!verifiedMatch) {
        setError("Fail Saved yang dipilih tidak mengembalikan padanan yang sah.");
      }
    } catch (matchingError: unknown) {
      if (
        controller.signal.aborted
        || requestId !== matchingRequestIdRef.current
        || requestFingerprint !== identityFingerprintRef.current
        || isAbortError(matchingError)
      ) {
        return;
      }
      setMatches([]);
      setSelectedImportId("");
      setHasSearched(true);
      onSelectionChange("");
      setError(resolveMutationErrorMessage(
        matchingError,
        "Semakan matching gagal. Cuba lagi sebentar.",
      ));
    } finally {
      if (
        !controller.signal.aborted
        && requestId === matchingRequestIdRef.current
        && requestFingerprint === identityFingerprintRef.current
      ) {
        setLoading(false);
        matchingControllerRef.current = null;
      }
    }
  }, [
    identity,
    identityFingerprint,
    invalidateVerifiedMatch,
    onSelectionChange,
    onValidationErrors,
    selectedSourceFileId,
  ]);

  const selectedMatch = useMemo(
    () => matches.find((match) => match.sourceImportId === selectedImportId) ?? null,
    [matches, selectedImportId],
  );

  const refreshSourceFiles = useCallback(() => {
    setSourceFilesReloadToken((current) => current + 1);
  }, []);

  return {
    error,
    hasSearched,
    loading,
    matches,
    selectedImportId,
    selectedMatch,
    selectedSourceFile,
    selectedSourceFileId,
    sourceFiles,
    sourceFilesError,
    sourceFilesLoading,
    sourceFilesTotal,
    sourceSearch,
    refreshSourceFiles,
    resetMatches,
    runMatching,
    selectSourceFile,
    setSourceSearch,
  };
}
