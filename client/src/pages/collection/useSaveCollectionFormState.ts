import { useCallback, useMemo, useState } from "react";
import type { CollectionAgingBucket, CollectionBatch } from "@/lib/api";
import {
  type SaveCollectionFieldErrors,
  type SaveCollectionFieldName,
  type SaveCollectionFormValues,
  validateSaveCollectionFormFields,
} from "@/pages/collection/save-collection-page-utils";
import type { SaveCollectionRestoredFormValues } from "@/pages/collection/save-collection-state-utils";
import { createEmptySaveCollectionRestoredFormValues } from "@/pages/collection/save-collection-state-utils";
import { getTodayIsoDate, isFutureDate } from "@/pages/collection/utils";

type UseSaveCollectionFormStateOptions = {
  staffNickname: string;
};

export function useSaveCollectionFormState({
  staffNickname,
}: UseSaveCollectionFormStateOptions) {
  const [customerName, setCustomerName] = useState("");
  const [icNumber, setIcNumber] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [sourceImportId, setSourceImportId] = useState("");
  const [agingBucket, setAgingBucket] = useState<CollectionAgingBucket>("D3");
  const [batch, setBatch] = useState<CollectionBatch>("P10");
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SaveCollectionFieldErrors>({});

  const maxPaymentDate = getTodayIsoDate();
  const isPaymentDateInFuture = paymentDate ? isFutureDate(paymentDate) : false;

  const values = useMemo<SaveCollectionFormValues>(() => ({
    staffNickname,
    customerName,
    icNumber,
    customerPhone,
    accountNumber,
    sourceImportId,
    agingBucket,
    batch,
    paymentDate,
    amount,
  }), [
    accountNumber,
    agingBucket,
    amount,
    batch,
    customerName,
    customerPhone,
    icNumber,
    paymentDate,
    sourceImportId,
    staffNickname,
  ]);

  const applyRestoredFormValues = useCallback((restored: SaveCollectionRestoredFormValues) => {
    setCustomerName(restored.customerName);
    setIcNumber(restored.icNumber);
    setCustomerPhone(restored.customerPhone);
    setAccountNumber(restored.accountNumber);
    setSourceImportId(restored.sourceImportId ?? "");
    setAgingBucket(restored.agingBucket ?? "D3");
    setBatch(restored.batch);
    setPaymentDate(restored.paymentDate);
    setAmount(restored.amount);
    setFieldErrors({});
  }, []);

  const clearFormValues = useCallback(() => {
    applyRestoredFormValues(createEmptySaveCollectionRestoredFormValues());
  }, [applyRestoredFormValues]);

  const clearFieldError = useCallback((fieldName: SaveCollectionFieldName) => {
    setFieldErrors((current) => {
      if (!current[fieldName]) {
        return current;
      }
      return {
        ...current,
        [fieldName]: undefined,
      };
    });
  }, []);

  const validateField = useCallback((fieldName: SaveCollectionFieldName) => {
    const nextErrors = validateSaveCollectionFormFields(values);
    setFieldErrors((current) => ({
      ...current,
      [fieldName]: nextErrors[fieldName],
    }));
  }, [values]);

  const applyFieldErrors = useCallback((errors: SaveCollectionFieldErrors) => {
    setFieldErrors(errors);
  }, []);

  const setCustomerNameInput = useCallback((value: string) => {
    setCustomerName(value);
    clearFieldError("customerName");
  }, [clearFieldError]);

  const setIcNumberInput = useCallback((value: string) => {
    setIcNumber(value);
    clearFieldError("icNumber");
  }, [clearFieldError]);

  const setCustomerPhoneInput = useCallback((value: string) => {
    setCustomerPhone(value);
    clearFieldError("customerPhone");
  }, [clearFieldError]);

  const setAccountNumberInput = useCallback((value: string) => {
    setAccountNumber(value);
    clearFieldError("accountNumber");
  }, [clearFieldError]);

  const setSourceImportIdInput = useCallback((value: string) => {
    setSourceImportId(value);
    clearFieldError("sourceImportId");
  }, [clearFieldError]);

  const setAgingBucketInput = useCallback((value: CollectionAgingBucket) => {
    setAgingBucket(value);
    clearFieldError("agingBucket");
  }, [clearFieldError]);

  const setBatchInput = useCallback((value: CollectionBatch) => {
    setBatch(value);
    clearFieldError("batch");
  }, [clearFieldError]);

  const setPaymentDateInput = useCallback((value: string) => {
    setPaymentDate(value);
    clearFieldError("paymentDate");
  }, [clearFieldError]);

  const setAmountInput = useCallback((value: string) => {
    setAmount(value);
    clearFieldError("amount");
  }, [clearFieldError]);

  return {
    customerName,
    icNumber,
    customerPhone,
    accountNumber,
    sourceImportId,
    agingBucket,
    batch,
    paymentDate,
    amount,
    maxPaymentDate,
    isPaymentDateInFuture,
    fieldErrors,
    values,
    setCustomerName: setCustomerNameInput,
    setIcNumber: setIcNumberInput,
    setCustomerPhone: setCustomerPhoneInput,
    setAccountNumber: setAccountNumberInput,
    setSourceImportId: setSourceImportIdInput,
    setAgingBucket: setAgingBucketInput,
    setBatch: setBatchInput,
    setPaymentDate: setPaymentDateInput,
    setAmount: setAmountInput,
    validateField,
    applyFieldErrors,
    applyRestoredFormValues,
    clearFormValues,
  };
}
