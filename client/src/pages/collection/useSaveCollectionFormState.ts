import { useCallback, useMemo, useState } from "react";
import type { CollectionBatch } from "@/lib/api";
import {
  type SaveCollectionFieldErrors,
  type SaveCollectionFieldName,
  type SaveCollectionFormValues,
  getSaveCollectionReadiness,
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
  const [cardNumber, setCardNumber] = useState("");
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
    cardNumber,
    batch,
    paymentDate,
    amount,
  }), [
    accountNumber,
    cardNumber,
    amount,
    batch,
    customerName,
    customerPhone,
    icNumber,
    paymentDate,
    staffNickname,
  ]);
  const readiness = useMemo(() => getSaveCollectionReadiness(values), [values]);

  const applyRestoredFormValues = useCallback((restored: SaveCollectionRestoredFormValues) => {
    setCustomerName(restored.customerName);
    setIcNumber(restored.icNumber);
    setCustomerPhone(restored.customerPhone);
    setAccountNumber(restored.accountNumber);
    setCardNumber(restored.cardNumber);
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

  const applyIdentityFieldErrors = useCallback((errors: SaveCollectionFieldErrors) => {
    setFieldErrors((current) => {
      const next = { ...current };
      const identityFields = [
        "customerName",
        "icNumber",
        "customerPhone",
        "accountNumber",
        "cardNumber",
      ] as const;

      identityFields.forEach((field) => {
        const message = errors[field];
        if (message) {
          next[field] = message;
        } else {
          delete next[field];
        }
      });

      return next;
    });
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
    clearFieldError("cardNumber");
  }, [clearFieldError]);

  const setCardNumberInput = useCallback((value: string) => {
    setCardNumber(value);
    clearFieldError("cardNumber");
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
    customerName,
    icNumber,
    customerPhone,
    accountNumber,
    cardNumber,
    batch,
    paymentDate,
    amount,
    maxPaymentDate,
    isPaymentDateInFuture,
    fieldErrors,
    readiness,
    values,
    setCustomerName: setCustomerNameInput,
    setIcNumber: setIcNumberInput,
    setCustomerPhone: setCustomerPhoneInput,
    setAccountNumber: setAccountNumberInput,
    setCardNumber: setCardNumberInput,
    setBatch: setBatchInput,
    setPaymentDate: setPaymentDateInput,
    setAmount: setAmountInput,
    validateField,
    applyFieldErrors,
    applyIdentityFieldErrors,
    applyRestoredFormValues,
    clearFormValues,
  };
}
