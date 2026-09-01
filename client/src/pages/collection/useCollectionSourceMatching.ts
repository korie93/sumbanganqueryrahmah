import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCollectionSourceMatches, type CollectionSourceMatch } from "@/lib/api";
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
  cardNumber: string;
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
  onValidationErrors?: (errors: SaveCollectionFieldErrors) => void,
) {
  const matchingControllerRef = useRef<AbortController | null>(null);
  const matchingRequestIdRef = useRef(0);
  const [matches, setMatches] = useState<CollectionSourceMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const identityFingerprint = useMemo(() => JSON.stringify({
    customerName: identity.customerName.trim(),
    icNumber: identity.icNumber.trim(),
    customerPhone: identity.customerPhone.trim(),
    accountNumber: identity.accountNumber.trim(),
    cardNumber: identity.cardNumber.trim(),
    paymentDate: identity.paymentDate.trim(),
    amount: identity.amount.trim(),
  }), [
    identity.accountNumber,
    identity.cardNumber,
    identity.amount,
    identity.customerName,
    identity.customerPhone,
    identity.icNumber,
    identity.paymentDate,
  ]);
  const identityFingerprintRef = useRef(identityFingerprint);
  identityFingerprintRef.current = identityFingerprint;

  const resetMatches = useCallback(() => {
    matchingControllerRef.current?.abort();
    matchingControllerRef.current = null;
    matchingRequestIdRef.current += 1;
    setMatches([]);
    setLoading(false);
    setError("");
    setHasSearched(false);
  }, []);

  useEffect(() => {
    resetMatches();
  }, [identityFingerprint, resetMatches]);

  useEffect(() => () => {
    matchingControllerRef.current?.abort();
    matchingRequestIdRef.current += 1;
  }, []);

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
    if (Object.keys(validationErrors).length > 0) {
      resetMatches();
      onValidationErrors?.(validationErrors);
      setError("Lengkapkan maklumat customer, payment date, dan amount sebelum semak auto-matching.");
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

    try {
      const response = await getCollectionSourceMatches(identity, { signal: controller.signal });
      if (
        controller.signal.aborted
        || requestId !== matchingRequestIdRef.current
        || requestFingerprint !== identityFingerprintRef.current
      ) return;
      setMatches(response.matches);
      setHasSearched(true);
      if (response.matches.length === 0) {
        setError("Tiada padanan Saved yang sah untuk maklumat ini.");
      }
    } catch (matchingError: unknown) {
      if (
        controller.signal.aborted
        || requestId !== matchingRequestIdRef.current
        || requestFingerprint !== identityFingerprintRef.current
        || isAbortError(matchingError)
      ) return;
      setMatches([]);
      setHasSearched(true);
      setError(resolveMutationErrorMessage(
        matchingError,
        "Auto-matching gagal. Cuba lagi sebentar.",
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
  }, [identity, identityFingerprint, onValidationErrors, resetMatches]);

  const selectedMatch = matches.length === 1 ? matches[0]! : null;

  return {
    error,
    hasSearched,
    loading,
    matches,
    selectedMatch,
    resetMatches,
    runMatching,
  };
}
