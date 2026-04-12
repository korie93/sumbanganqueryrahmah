export type RestorableCollectionRecordRow = {
  id: string;
  customerName: string;
  customerNameSearchHashes: string[] | null;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: string;
  paymentDate: string;
  amount: number;
  receiptFile: string | null;
  receiptTotalAmount: number;
  receiptValidationStatus: string;
  receiptValidationMessage: string | null;
  receiptCount: number;
  duplicateReceiptFlag: boolean;
  createdByLogin: string;
  collectionStaffNickname: string;
  staffUsername: string;
  createdAt: Date;
};

export type RestorableCollectionReceiptRow = {
  id: string;
  collectionRecordId: string;
  storagePath: string;
  originalFileName: string;
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
  receiptAmount: number | null;
  extractedAmount: number | null;
  extractionStatus: string;
  extractionConfidence: number | null;
  receiptDate: string | null;
  receiptReference: string | null;
  fileHash: string | null;
  createdAt: Date;
};
