import { useCallback, useMemo, useState } from "react";
import type { CollectionBatch } from "@/lib/api";
import type { CollectionSourceImport } from "@/pages/collection/useCollectionSourceImports";
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
  const [sourceImportId, setSourceImportId] = useState("");
  const [sourceImportName, setSourceImportName] = useState("");
  const [sourceFilename, setSourceFilename] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [icNumber, setIcNumber] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [batch, setBatch] = useState<CollectionBatch>("P10");
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SaveCollectionFieldErrors>({});

  const maxPaymentDate = getTodayIsoDate();
  const isPaymentDateInFuture = paymentDate ? isFutureDate(paymentDate) : false;

  const values = useMemo<SaveCollectionFormValues>(() => ({
    staffNickname,
    sourceImportId,
    sourceImportName,
    sourceFilename,
    customerName,
    icNumber,
    customerPhone,
    accountNumber,
    batch,
    paymentDate,
    amount,
  }), [
    accountNumber,
    amount,
    batch,
    customerName,
    customerPhone,
    icNumber,
    paymentDate,
    sourceFilename,
    sourceImportId,
    sourceImportName,
    staffNickname,
  ]);

  const applyRestoredFormValues = useCallback((restored: SaveCollectionRestoredFormValues) => {
    setSourceImportId(restored.sourceImportId);
    setSourceImportName(restored.sourceImportName);
    setSourceFilename(restored.sourceFilename);
    setCustomerName(restored.customerName);
    setIcNumber(restored.icNumber);
    setCustomerPhone(restored.customerPhone);
    setAccountNumber(restored.accountNumber);
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

  const setSourceImportInput = useCallback((source: CollectionSourceImport | null) => {
    setSourceImportId(source?.id ?? "");
    setSourceImportName(source?.name ?? "");
    setSourceFilename(source?.filename ?? "");
    clearFieldError("sourceImportId");
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
    sourceImportId,
    sourceImportName,
    sourceFilename,
    customerName,
    icNumber,
    customerPhone,
    accountNumber,
    batch,
    paymentDate,
    amount,
    maxPaymentDate,
    isPaymentDateInFuture,
    fieldErrors,
    values,
    setCustomerName: setCustomerNameInput,
    setSourceImport: setSourceImportInput,
    setIcNumber: setIcNumberInput,
    setCustomerPhone: setCustomerPhoneInput,
    setAccountNumber: setAccountNumberInput,
    setBatch: setBatchInput,
    setPaymentDate: setPaymentDateInput,
    setAmount: setAmountInput,
    validateField,
    applyFieldErrors,
    applyRestoredFormValues,
    clearFormValues,
  };
}
