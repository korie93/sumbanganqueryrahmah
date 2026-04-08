import assert from "node:assert/strict";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import test from "node:test";
import { BackupsRepository } from "../backups.repository";
import { db } from "../../db-postgres";
import { decodeBackupDataFromStorage } from "../backups-encryption";

type EnvOverrides = Record<string, string | null>;

const repoOptions = {
  ensureBackupsTable: async () => {},
  parseBackupMetadataSafe: () => null,
};

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

        const encryptedPayload = await fs.readFile(prepared.tempFilePath);
        const storagePayload = `${String(prepared.tempPayloadStoragePrefix || "")}${encryptedPayload.toString("base64")}`;
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
