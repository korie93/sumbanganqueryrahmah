export type RestorableCollectionRecordRow = {
  id: string;
  customerName: string;
  customerNameSearchHashes: string[] | null;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  cardNumberLast4: string | null;
  sourceImportId: string | null;
  sourceDataRowId: string | null;
  sourceImportName: string | null;
  sourceFilename: string | null;
  agingBucket: "D3" | "D4" | "D5" | "D6" | null;
  totalDue: number | null;
  billingPrincipalOsp: number | null;
  callingDate: string | null;
  callingWindowEndExclusive: string | null;
  sourceMatchBasis:
    | "ic"
    | "phone_and_account"
    | "account_number"
    | "card_number"
    | "account_and_card"
    | null;
  sourceMatchAccuracy: number | null;
  sourceObligationKey: string | null;
  settlementCycleKey: string | null;
  classification: "cp" | "abort_cp" | null;
  cumulativeCollected: number | null;
  remainingAmount: number | null;
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

export type RestorableCollectionSourceConfigRow = {
  sourceImportId: string;
  validFrom: string;
  validTo: string;
  cycleKey: string;
  enabled: boolean;
  compatibilityStatus: "compatible" | "incompatible";
  compatibilityIssues: string[];
  indexedRowCount: number;
  configuredBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RestorableCollectionSourceRow = {
  sourceImportId: string;
  sourceDataRowId: string;
  accountNumberHash: string | null;
  cardNumberHash: string | null;
  cardNumberLast4: string | null;
  canonicalObligationKey: string;
  totalDue: number;
  billingPrincipalOsp: number;
  totalOsb: number | null;
  agingBucket: "D3" | "D4" | "D5" | "D6";
  callingDate: string;
  createdAt: Date;
};

export type RestorableCollectionOspTargetRow = {
  id: string;
  sourceScopeHash: string;
  sourceImportIds: string[];
  periodFrom: string;
  periodTo: string;
  agingBucket: "D3" | "D4" | "D5" | "D6";
  totalOspBaseline: number | null;
  targetPercentage: number;
  configuredBy: string;
  createdAt: Date;
  updatedAt: Date;
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

export type RestorableCollectionRecordPurgeHistoryRow = {
  id: string;
  sourceImportId: string | null;
  sourceDataRowId: string | null;
  sourceImportName: string | null;
  sourceFilename: string | null;
  icNumberSearchHash: string | null;
  customerPhoneSearchHash: string | null;
  accountNumberSearchHash: string | null;
  paymentDate: string;
  amount: number;
  createdByLogin: string;
  collectionStaffNickname: string;
  originalCreatedAt: Date;
  purgedAt: Date;
  purgedBy: string;
  purgeReason: "retention_policy";
};
