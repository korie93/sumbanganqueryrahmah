import { useCallback, useMemo, useState } from "react";
import { formatCollectionAmountMyrString } from "@shared/collection-amount-types";
import {
  type CollectionBatch,
  type CollectionRecord,
  type CollectionRecordReceipt,
  type CollectionStaffNickname,
} from "@/lib/api";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import { COLLECTION_BATCH_OPTIONS, getTodayIsoDate } from "@/pages/collection/utils";
import { useCollectionRecordEditReceiptState } from "@/pages/collection-records/useCollectionRecordEditReceiptState";
import { useCollectionRecordEditSaveAction } from "@/pages/collection-records/useCollectionRecordEditSaveAction";

type UseCollectionRecordEditArgs = {
  loadingNicknames: boolean;
  nicknameOptions: CollectionStaffNickname[];
  onRefresh: () => Promise<unknown>;
  onViewReceipt: (record: CollectionRecord, receiptId?: string) => void;
};

export function useCollectionRecordEdit({
  loadingNicknames,
  nicknameOptions,
  onRefresh,
  onViewReceipt,
}: UseCollectionRecordEditArgs) {
  const { notifyMutationError, notifyMutationSuccess } = useMutationFeedback();
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CollectionRecord | null>(null);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editIcNumber, setEditIcNumber] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editAccountNumber, setEditAccountNumber] = useState("");
  const [editBatch, setEditBatch] = useState<CollectionBatch>("P10");
  const [editPaymentDate, setEditPaymentDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editStaffNickname, setEditStaffNickname] = useState("");
  const maxPaymentDate = getTodayIsoDate();
  const notifyEditMutationSuccess = useCallback((options: {
    title: string;
    description?: string;
  }) => {
    notifyMutationSuccess({
      title: options.title,
      description: options.description ?? "",
    });
  }, [notifyMutationSuccess]);

  const receiptState = useCollectionRecordEditReceiptState({
    onValidationError: (description) =>
      notifyMutationError({
        title: "Validation Error",
        description,
      }),
  });

  const closeEditDialog = useCallback(() => {
    setEditOpen(false);
  }, []);

  const resetEditState = useCallback(() => {
    setEditingRecord(null);
    setEditCustomerName("");
    setEditIcNumber("");
    setEditCustomerPhone("");
    setEditAccountNumber("");
    setEditBatch("P10");
    setEditPaymentDate("");
    setEditAmount("");
    setEditStaffNickname("");
    receiptState.resetReceiptState();
  }, [receiptState.resetReceiptState]);

  const saveAction = useCollectionRecordEditSaveAction({
    editingRecord,
    customerName: editCustomerName,
    icNumber: editIcNumber,
    customerPhone: editCustomerPhone,
    accountNumber: editAccountNumber,
    batch: editBatch,
    paymentDate: editPaymentDate,
    amount: editAmount,
    staffNickname: editStaffNickname,
    nicknameOptions,
    newReceiptFiles: receiptState.editNewReceiptFiles,
    existingReceiptDrafts: receiptState.editExistingReceiptDrafts,
    pendingReceiptDrafts: receiptState.editPendingReceiptDrafts,
    removedReceiptIds: receiptState.editRemovedReceiptIds,
    onRefresh,
    closeDialog: closeEditDialog,
    resetEditState,
    notifyMutationError,
    notifyMutationSuccess: notifyEditMutationSuccess,
  });

  const handleEditDialogOpenChange = useCallback((open: boolean) => {
    setEditOpen(open);
    if (open) {
      return;
    }

    resetEditState();
    saveAction.resetEditMutationIntent();
  }, [resetEditState, saveAction.resetEditMutationIntent]);

  const openEditDialog = useCallback((record: CollectionRecord) => {
    setEditingRecord(record);
    setEditCustomerName(record.customerName);
    setEditIcNumber(record.icNumber);
    setEditCustomerPhone(record.customerPhone);
    setEditAccountNumber(record.accountNumber);
    setEditBatch(record.batch);
    setEditPaymentDate(record.paymentDate);
    setEditAmount(formatCollectionAmountMyrString(record.amount));
    setEditStaffNickname(record.collectionStaffNickname);
    receiptState.populateReceiptStateFromRecord(record);
    saveAction.resetEditMutationIntent();
    setEditOpen(true);
  }, [receiptState.populateReceiptStateFromRecord, saveAction.resetEditMutationIntent]);

  const editDialog = useMemo(
    () => ({
      open: editOpen,
      savingEdit: saveAction.savingEdit,
      loadingNicknames,
      editingRecord,
      nicknameOptions,
      batchOptions: COLLECTION_BATCH_OPTIONS,
      editCustomerName,
      editIcNumber,
      editCustomerPhone,
      editAccountNumber,
      editBatch,
      editPaymentDate,
      editAmount,
      editStaffNickname,
      maxPaymentDate,
      editNewReceiptFiles: receiptState.editNewReceiptFiles,
      editExistingReceiptDrafts: receiptState.editExistingReceiptDrafts,
      editPendingReceiptDrafts: receiptState.editPendingReceiptDrafts,
      editRemovedReceiptIds: receiptState.editRemovedReceiptIds,
      editReceiptInputRef: receiptState.editReceiptInputRef,
      onOpenChange: handleEditDialogOpenChange,
      onCustomerNameChange: setEditCustomerName,
      onIcNumberChange: setEditIcNumber,
      onCustomerPhoneChange: setEditCustomerPhone,
      onAccountNumberChange: setEditAccountNumber,
      onBatchChange: setEditBatch,
      onPaymentDateChange: setEditPaymentDate,
      onAmountChange: setEditAmount,
      onStaffNicknameChange: setEditStaffNickname,
      onReceiptChange: receiptState.handleEditReceiptChange,
      onRemovePendingReceipt: receiptState.handleRemovePendingReceipt,
      onClearPendingReceipts: receiptState.handleClearPendingReceipts,
      onExistingReceiptDraftChange: receiptState.handleExistingReceiptDraftChange,
      onPendingReceiptDraftChange: receiptState.handlePendingReceiptDraftChange,
      onToggleRemoveExistingReceipt: receiptState.handleToggleRemoveExistingReceipt,
      onViewExistingReceipt: (receipt: CollectionRecordReceipt) =>
        editingRecord ? onViewReceipt(editingRecord, receipt.id) : undefined,
      onSave: () => void saveAction.handleSaveEdit(),
    }),
    [
      editAccountNumber,
      editAmount,
      editBatch,
      editCustomerName,
      editCustomerPhone,
      editIcNumber,
      editOpen,
      editPaymentDate,
      editStaffNickname,
      editingRecord,
      handleEditDialogOpenChange,
      loadingNicknames,
      maxPaymentDate,
      nicknameOptions,
      onViewReceipt,
      receiptState.editExistingReceiptDrafts,
      receiptState.editNewReceiptFiles,
      receiptState.editPendingReceiptDrafts,
      receiptState.editReceiptInputRef,
      receiptState.editRemovedReceiptIds,
      receiptState.handleClearPendingReceipts,
      receiptState.handleEditReceiptChange,
      receiptState.handleExistingReceiptDraftChange,
      receiptState.handlePendingReceiptDraftChange,
      receiptState.handleRemovePendingReceipt,
      receiptState.handleToggleRemoveExistingReceipt,
      saveAction.handleSaveEdit,
      saveAction.savingEdit,
    ],
  );

  return {
    openEditDialog,
    editDialog,
  };
}
