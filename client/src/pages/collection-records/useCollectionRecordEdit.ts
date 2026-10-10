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
import { getCollectionRecordEditCloseDecision } from "./collection-record-edit-close-policy";

type UseCollectionRecordEditArgs = {
  canManageManualSettlement: boolean;
  loadingNicknames: boolean;
  nicknameOptions: CollectionStaffNickname[];
  onRefresh: () => Promise<unknown>;
  onViewReceipt: (record: CollectionRecord, receiptId?: string) => void;
};

export function useCollectionRecordEdit({
  canManageManualSettlement,
  loadingNicknames,
  nicknameOptions,
  onRefresh,
  onViewReceipt,
}: UseCollectionRecordEditArgs) {
  const { notifyMutationError, notifyMutationSuccess } = useMutationFeedback();
  const [editOpen, setEditOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
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
    setDiscardConfirmOpen(false);
    setEditOpen(false);
  }, []);

  const resetEditState = useCallback(() => {
    setDiscardConfirmOpen(false);
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
  }, [receiptState]);

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
    if (open) {
      setDiscardConfirmOpen(false);
      setEditOpen(true);
      return;
    }

    const decision = getCollectionRecordEditCloseDecision({
      hasChanges: saveAction.changeReview.hasChanges,
      savingEdit: saveAction.savingEdit,
    });
    if (decision === "ignore") return;
    if (decision === "confirm") {
      setDiscardConfirmOpen(true);
      return;
    }

    closeEditDialog();
    resetEditState();
    saveAction.resetEditMutationIntent();
  }, [closeEditDialog, resetEditState, saveAction]);

  const handleDiscardConfirmOpenChange = useCallback((open: boolean) => {
    if (saveAction.savingEdit || open) return;
    // Continuing the edit (including Escape in the confirmation) preserves all
    // field values, receipt drafts, pending files, and the current save intent.
    setDiscardConfirmOpen(false);
  }, [saveAction.savingEdit]);

  const handleDiscardChanges = useCallback(() => {
    if (!discardConfirmOpen) return;
    const decision = getCollectionRecordEditCloseDecision({
      hasChanges: saveAction.changeReview.hasChanges,
      savingEdit: saveAction.savingEdit,
      discardConfirmed: true,
    });
    if (decision !== "close") return;

    closeEditDialog();
    resetEditState();
    saveAction.resetEditMutationIntent();
  }, [closeEditDialog, discardConfirmOpen, resetEditState, saveAction]);

  const openEditDialog = useCallback((record: CollectionRecord) => {
    setDiscardConfirmOpen(false);
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
  }, [receiptState, saveAction]);

  const editDialog = useMemo(
    () => ({
      open: editOpen,
      discardConfirmOpen,
      savingEdit: saveAction.savingEdit,
      changeReview: saveAction.changeReview,
      loadingNicknames,
      editingRecord,
      canManageManualSettlement,
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
      onDiscardConfirmOpenChange: handleDiscardConfirmOpenChange,
      onDiscardChanges: handleDiscardChanges,
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
      onManualSettlementChanged: async (record: CollectionRecord) => {
        setEditingRecord(record);
        await onRefresh();
      },
    }),
    [
      editAccountNumber,
      discardConfirmOpen,
      canManageManualSettlement,
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
      handleDiscardConfirmOpenChange,
      handleDiscardChanges,
      loadingNicknames,
      maxPaymentDate,
      nicknameOptions,
      onViewReceipt,
      onRefresh,
      receiptState,
      saveAction,
    ],
  );

  return {
    openEditDialog,
    editDialog,
  };
}
