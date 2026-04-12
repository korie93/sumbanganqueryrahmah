export type EncryptedCollectionRecordPiiValues = {
  customerNameEncrypted: string | null;
  icNumberEncrypted: string | null;
  customerPhoneEncrypted: string | null;
  accountNumberEncrypted: string | null;
};

export type CollectionRecordPiiSearchHashes = {
  customerNameSearchHash: string | null;
  customerNameSearchHashes: string[] | null;
  icNumberSearchHash: string | null;
  customerPhoneSearchHash: string | null;
  accountNumberSearchHash: string | null;
};

export type CollectionPiiFieldName =
  | "customerName"
  | "icNumber"
  | "customerPhone"
  | "accountNumber";
