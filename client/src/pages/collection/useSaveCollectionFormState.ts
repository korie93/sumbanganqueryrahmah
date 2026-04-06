import { useCallback, useMemo, useState } from "react";
import type { CollectionBatch } from "@/lib/api";
import type { SaveCollectionFormValues } from "@/pages/collection/save-collection-page-utils";
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
  const [batch, setBatch] = useState<CollectionBatch>("P10");
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");

  const maxPaymentDate = getTodayIsoDate();
  const isPaymentDateInFuture = paymentDate ? isFutureDate(paymentDate) : false;

  const values = useMemo<SaveCollectionFormValues>(() => ({
    staffNickname,
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
    staffNickname,
  ]);

  const applyRestoredFormValues = useCallback((restored: SaveCollectionRestoredFormValues) => {
    setCustomerName(restored.customerName);
    setIcNumber(restored.icNumber);
    setCustomerPhone(restored.customerPhone);
    setAccountNumber(restored.accountNumber);
    setBatch(restored.batch);
    setPaymentDate(restored.paymentDate);
    setAmount(restored.amount);
  }, []);

  const clearFormValues = useCallback(() => {
    applyRestoredFormValues(createEmptySaveCollectionRestoredFormValues());
  }, [applyRestoredFormValues]);

  return {
    customerName,
    icNumber,
    customerPhone,
    accountNumber,
    batch,
    paymentDate,
    amount,
    maxPaymentDate,
    isPaymentDateInFuture,
    values,
    setCustomerName,
    setIcNumber,
    setCustomerPhone,
    setAccountNumber,
    setBatch,
    setPaymentDate,
    setAmount,
    applyRestoredFormValues,
    clearFormValues,
  };
}
