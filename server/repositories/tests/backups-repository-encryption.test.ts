import assert from "node:assert/strict";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import test from "node:test";
import { BackupsRepository } from "../backups.repository";
import { db } from "../../db-postgres";
import { decodeBackupDataFromStorage } from "../backups-encryption";
import {
  iteratePreparedBackupPayloadStorageChunks,
  readPreparedBackupPayloadForStorage,
} from "../backups-payload-utils";
import { BACKUP_MAX_SERIALIZED_ROW_BYTES } from "../backups-repository-types";

type EnvOverrides = Record<string, string | null>;

const repoOptions = {
  ensureBackupsTable: async () => {},
  parseBackupMetadataSafe: () => null,
};

function flattenSqlChunk(chunk: unknown): string {
  if (chunk === null || chunk === undefined) {
    return "";
  }
  if (typeof chunk === "string") {
    return chunk;
  }
  if (Array.isArray(chunk)) {
    return chunk.map((item) => flattenSqlChunk(item)).join("");
  }
  if (typeof chunk === "object") {
    const value = (chunk as { value?: unknown; queryChunks?: unknown[] }).value;
    if (value !== undefined) {
      return flattenSqlChunk(value);
    }
    const queryChunks = (chunk as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(queryChunks)) {
      return queryChunks.map((item) => flattenSqlChunk(item)).join("");
    }
  }
  return "";
}

function normalizeSqlText(query: unknown): string {
  return flattenSqlChunk(query).replace(/\s+/g, " ").trim();
}

async function withEnv<T>(overrides: EnvOverrides, fn: () => Promise<T> | T): Promise<T> {
  const previousValues = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previousValues.set(key, process.env[key]);
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, previousValue] of previousValues.entries()) {
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

test("BackupsRepository requires encryption keys outside development/test", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_ENCRYPTION_KEY_ID: null,
    },
    async () => {
      assert.throws(
        () => new BackupsRepository(repoOptions),
        /Backup encryption is required outside development\/test/i,
      );
    },
  );
});

test("BackupsRepository accepts valid production key configuration", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      BACKUP_ENCRYPTION_KEY: "B".repeat(32),
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_ENCRYPTION_KEY_ID: null,
    },
    async () => {
      const repository = new BackupsRepository(repoOptions);
      assert.ok(repository);
    },
  );
});

test("BackupsRepository rejects mismatched preferred key id configuration", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: `primary:${"A".repeat(32)}`,
      BACKUP_ENCRYPTION_KEY_ID: "missing",
    },
    async () => {
      assert.throws(
        () => new BackupsRepository(repoOptions),
        /BACKUP_ENCRYPTION_KEY_ID 'missing' is configured but no matching key exists/i,
      );
    },
  );
});

function encryptBackupPayloadV2(params: {
  keyId: string;
  key: Buffer;
  payloadJson: string;
}): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", params.key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(params.payloadJson, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `enc:v2:${params.keyId}.${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

test("BackupsRepository decodes encrypted v2 payloads when reading backup data", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: `primary:${"A".repeat(32)}`,
      BACKUP_ENCRYPTION_KEY_ID: "primary",
    },
    async () => {
      let ensureCalled = 0;
      const repository = new BackupsRepository({
        ensureBackupsTable: async () => {
          ensureCalled += 1;
        },
        parseBackupMetadataSafe: () => null,
      });

      const payloadJson = JSON.stringify({
        imports: [],
        dataRows: [],
        users: [],
        auditLogs: [],
      });
      const encryptedPayload = encryptBackupPayloadV2({
        keyId: "primary",
        key: Buffer.from("A".repeat(32), "utf8"),
        payloadJson,
      });

      const dbAny = db as any;
      const originalExecute = dbAny.execute;
      dbAny.execute = async () => ({
        rows: [
          {
            id: "backup-1",
            name: "Encrypted Backup",
            createdAt: new Date("2026-03-21T00:00:00.000Z"),
            createdBy: "super.user",
            backupData: encryptedPayload,
            metadata: null,
          },
        ],
      });

      try {
        const backup = await repository.getBackupById("backup-1");
        assert.equal(ensureCalled, 1);
        assert.ok(backup);
        assert.equal(backup?.backupData, payloadJson);
      } finally {
        dbAny.execute = originalExecute;
      }
    },
  );
});

test("BackupsRepository prepares encrypted temp backup payload files when an encryption key is configured", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: `primary:${"A".repeat(32)}`,
      BACKUP_ENCRYPTION_KEY_ID: "primary",
    },
    async () => {
      const repository = new BackupsRepository(repoOptions);

      const dbAny = db as any;
      const originalExecute = dbAny.execute;
      dbAny.execute = async () => ({
        rows: [],
      });

      let prepared: Awaited<ReturnType<BackupsRepository["prepareBackupPayloadFileForCreate"]>> | null =
        null;

      try {
        prepared = await repository.prepareBackupPayloadFileForCreate();
        assert.equal(prepared.tempPayloadEncrypted, true);
        assert.equal(typeof prepared.tempPayloadStoragePrefix, "string");
        assert.match(String(prepared.tempPayloadStoragePrefix || ""), /^enc:v2:primary\./);
        assert.ok(prepared.payloadBytes > 0);

        const storagePayload = await readPreparedBackupPayloadForStorage(prepared);
        const decryptedPayload = decodeBackupDataFromStorage(storagePayload, {
          requireEncryption: true,
          primaryKeyId: "primary",
          keysById: new Map([["primary", Buffer.from("A".repeat(32), "utf8")]]),
        });
        const parsed = JSON.parse(decryptedPayload) as Record<string, unknown>;
        assert.deepEqual(Object.keys(parsed), [
          "imports",
          "dataRows",
          "users",
          "auditLogs",
          "collectionRecords",
          "collectionRecordReceipts",
        ]);
      } finally {
        dbAny.execute = originalExecute;
        await prepared?.cleanup();
      }
    },
  );
});

test("BackupsRepository iterates encrypted temp backup payload storage chunks without rebuilding one giant string", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: `primary:${"A".repeat(32)}`,
      BACKUP_ENCRYPTION_KEY_ID: "primary",
    },
    async () => {
      const repository = new BackupsRepository(repoOptions);

      const dbAny = db as any;
      const originalExecute = dbAny.execute;
      dbAny.execute = async () => ({
        rows: [],
      });

      let prepared: Awaited<ReturnType<BackupsRepository["prepareBackupPayloadFileForCreate"]>> | null =
        null;

      try {
        prepared = await repository.prepareBackupPayloadFileForCreate();
        const iteratedChunks: string[] = [];
        for await (const chunk of iteratePreparedBackupPayloadStorageChunks(prepared)) {
          iteratedChunks.push(chunk);
        }

        assert.equal(iteratedChunks[0], prepared.tempPayloadStoragePrefix);
        assert.ok(iteratedChunks.length >= 2);
        const manualStoragePayload = `${String(prepared.tempPayloadStoragePrefix || "")}${(await fs.readFile(prepared.tempFilePath)).toString("base64")}`;
        assert.equal(iteratedChunks.join(""), manualStoragePayload);
      } finally {
        dbAny.execute = originalExecute;
        await prepared?.cleanup();
      }
    },
  );
});

test("BackupsRepository exports collection backup payload amounts with explicit cents field names", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: `primary:${"A".repeat(32)}`,
      BACKUP_ENCRYPTION_KEY_ID: "primary",
    },
    async () => {
      const repository = new BackupsRepository(repoOptions);

      const dbAny = db as any;
      const originalExecute = dbAny.execute;
      dbAny.execute = async (query: unknown) => {
        const sqlText = normalizeSqlText(query);
        if (sqlText.includes("FROM public.collection_records")) {
          return {
            rows: [
              {
                id: "record-1",
                customerName: "Alice Tan",
                customerNameEncrypted: "enc.customer-name",
                icNumber: "900101015555",
                icNumberEncrypted: "enc.ic-number",
                customerPhone: "0123000001",
                customerPhoneEncrypted: "enc.customer-phone",
                accountNumber: "ACC-1001",
                accountNumberEncrypted: "enc.account-number",
                batch: "P10",
                paymentDate: "2026-03-31",
                amount: "100.00",
                receiptFile: null,
                receiptTotalAmountCents: "10000",
                receiptValidationStatus: "matched",
                receiptValidationMessage: null,
                receiptCount: 1,
                duplicateReceiptFlag: false,
                createdByLogin: "system",
                collectionStaffNickname: "Collector Alpha",
                staffUsername: "staff.user",
                createdAt: new Date("2026-03-31T08:00:00.000Z"),
              },
            ],
          };
        }
        if (sqlText.includes("FROM public.collection_record_receipts")) {
          return {
            rows: [
              {
                id: "receipt-1",
                collectionRecordId: "record-1",
                storagePath: "/uploads/collection-receipts/receipt-1.jpg",
                originalFileName: "receipt-1.jpg",
                originalMimeType: "image/jpeg",
                originalExtension: ".jpg",
                fileSize: 2048,
                receiptAmountCents: "505",
                extractedAmountCents: "500",
                extractionStatus: "suggested",
                extractionConfidence: "0.95",
                receiptDate: "2026-03-31",
                receiptReference: "REF-100",
                fileHash: "hash-1",
                createdAt: new Date("2026-03-31T08:00:00.000Z"),
              },
            ],
          };
        }
        return { rows: [] };
      };

      let prepared: Awaited<ReturnType<BackupsRepository["prepareBackupPayloadFileForCreate"]>> | null =
        null;

      try {
        prepared = await repository.prepareBackupPayloadFileForCreate();
        const encryptedPayload = await fs.readFile(prepared.tempFilePath);
        const storagePayload = `${String(prepared.tempPayloadStoragePrefix || "")}${encryptedPayload.toString("base64")}`;
        const decryptedPayload = decodeBackupDataFromStorage(storagePayload, {
          requireEncryption: true,
          primaryKeyId: "primary",
          keysById: new Map([["primary", Buffer.from("A".repeat(32), "utf8")]]),
        });
        const parsed = JSON.parse(decryptedPayload) as {
          collectionRecords?: Array<Record<string, unknown>>;
          collectionRecordReceipts?: Array<Record<string, unknown>>;
        };

        assert.equal(parsed.collectionRecords?.[0]?.receiptTotalAmountCents, "10000");
        assert.equal("receiptTotalAmount" in (parsed.collectionRecords?.[0] || {}), false);
        assert.equal("customerName" in (parsed.collectionRecords?.[0] || {}), false);
        assert.equal("icNumber" in (parsed.collectionRecords?.[0] || {}), false);
        assert.equal("customerPhone" in (parsed.collectionRecords?.[0] || {}), false);
        assert.equal("accountNumber" in (parsed.collectionRecords?.[0] || {}), false);
        assert.equal(parsed.collectionRecords?.[0]?.customerNameEncrypted, "enc.customer-name");
        assert.equal(parsed.collectionRecords?.[0]?.icNumberEncrypted, "enc.ic-number");
        assert.equal(parsed.collectionRecords?.[0]?.customerPhoneEncrypted, "enc.customer-phone");
        assert.equal(parsed.collectionRecords?.[0]?.accountNumberEncrypted, "enc.account-number");
        assert.equal(parsed.collectionRecordReceipts?.[0]?.receiptAmountCents, "505");
        assert.equal(parsed.collectionRecordReceipts?.[0]?.extractedAmountCents, "500");
        assert.equal("receiptAmount" in (parsed.collectionRecordReceipts?.[0] || {}), false);
        assert.equal("extractedAmount" in (parsed.collectionRecordReceipts?.[0] || {}), false);
      } finally {
        dbAny.execute = originalExecute;
        await prepared?.cleanup();
      }
    },
  );
});

test("BackupsRepository keeps plaintext collection PII in backup payloads when encrypted shadows are unavailable", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: `primary:${"A".repeat(32)}`,
      BACKUP_ENCRYPTION_KEY_ID: "primary",
    },
    async () => {
      const repository = new BackupsRepository(repoOptions);

      const dbAny = db as any;
      const originalExecute = dbAny.execute;
      dbAny.execute = async (query: unknown) => {
        const sqlText = normalizeSqlText(query);
        if (sqlText.includes("FROM public.collection_records")) {
          return {
            rows: [
              {
                id: "record-1",
                customerName: "Legacy Alice",
                customerNameEncrypted: null,
                icNumber: "900101015555",
                icNumberEncrypted: null,
                customerPhone: "0123000001",
                customerPhoneEncrypted: null,
                accountNumber: "ACC-1001",
                accountNumberEncrypted: null,
                batch: "P10",
                paymentDate: "2026-03-31",
                amount: "100.00",
                receiptFile: null,
                receiptTotalAmountCents: "10000",
                receiptValidationStatus: "matched",
                receiptValidationMessage: null,
                receiptCount: 1,
                duplicateReceiptFlag: false,
                createdByLogin: "system",
                collectionStaffNickname: "Collector Alpha",
                staffUsername: "staff.user",
                createdAt: new Date("2026-03-31T08:00:00.000Z"),
              },
            ],
          };
        }
        return { rows: [] };
      };

      let prepared: Awaited<ReturnType<BackupsRepository["prepareBackupPayloadFileForCreate"]>> | null =
        null;

      try {
        prepared = await repository.prepareBackupPayloadFileForCreate();
        const encryptedPayload = await fs.readFile(prepared.tempFilePath);
        const storagePayload = `${String(prepared.tempPayloadStoragePrefix || "")}${encryptedPayload.toString("base64")}`;
        const decryptedPayload = decodeBackupDataFromStorage(storagePayload, {
          requireEncryption: true,
          primaryKeyId: "primary",
          keysById: new Map([["primary", Buffer.from("A".repeat(32), "utf8")]]),
        });
        const parsed = JSON.parse(decryptedPayload) as {
          collectionRecords?: Array<Record<string, unknown>>;
        };

        assert.equal(parsed.collectionRecords?.[0]?.customerName, "Legacy Alice");
        assert.equal(parsed.collectionRecords?.[0]?.icNumber, "900101015555");
        assert.equal(parsed.collectionRecords?.[0]?.customerPhone, "0123000001");
        assert.equal(parsed.collectionRecords?.[0]?.accountNumber, "ACC-1001");
        assert.equal("customerNameEncrypted" in (parsed.collectionRecords?.[0] || {}), false);
      } finally {
        dbAny.execute = originalExecute;
        await prepared?.cleanup();
      }
    },
  );
});

test("BackupsRepository rejects backup export rows that exceed the serialization guard", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: `primary:${"A".repeat(32)}`,
      BACKUP_ENCRYPTION_KEY_ID: "primary",
    },
    async () => {
      const repository = new BackupsRepository(repoOptions);

      const dbAny = db as any;
      const originalExecute = dbAny.execute;
      dbAny.execute = async (query: unknown) => {
        const sqlText = normalizeSqlText(query);
        if (sqlText.includes("FROM public.data_rows")) {
          return {
            rows: [
              {
                id: "row-oversized",
                importId: "import-1",
                jsonDataJsonb: "x".repeat(BACKUP_MAX_SERIALIZED_ROW_BYTES + 128),
              },
            ],
          };
        }
        return { rows: [] };
      };

      await assert.rejects(
        () => repository.prepareBackupPayloadFileForCreate(),
        /exceeds the .* serialization limit/i,
      );

      dbAny.execute = originalExecute;
    },
  );
});
