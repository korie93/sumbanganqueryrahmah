import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type { PostgresStorage } from "../../storage-postgres";

type AuditEntry = {
  action: string;
  performedBy?: string;
  targetUser?: string;
  details?: string;
};

export function createAccountsStorageDouble() {
  const actor = {
    id: "superuser-1",
    username: "root.admin",
    fullName: "Root Admin",
    email: "root.admin@example.com",
    role: "superuser",
    status: "active",
    passwordHash: null,
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: null,
    lastLoginAt: null,
  };
  const accounts = [
    { username: "admin.alpha", role: "admin", isBanned: false },
    { username: "user.beta", role: "user", isBanned: true },
  ];

  const storage = {
    getUser: async (userId: string) => (userId === actor.id ? actor : null),
    getUserByUsername: async (username: string) => (username === actor.username ? actor : null),
    getAccounts: async () => accounts,
  } as unknown as PostgresStorage;

  return { storage, actor, accounts };
}

export function createDevMailAdminStorageDouble() {
  const actor = {
    id: "superuser-mail-1",
    username: "mail.admin",
    fullName: "Mail Admin",
    email: "mail.admin@example.com",
    role: "superuser",
    status: "active",
    passwordHash: null,
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: null,
    lastLoginAt: null,
  };
  const auditLogs: AuditEntry[] = [];

  const storage = {
    getUser: async (userId: string) => (userId === actor.id ? actor : null),
    getUserByUsername: async (username: string) => (username === actor.username ? actor : null),
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
  } as unknown as PostgresStorage;

  return { storage, actor, auditLogs };
}

export function createManagedUsersPageStorageDouble() {
  const actor = {
    id: "superuser-managed-1",
    username: "managed.admin",
    fullName: "Managed Admin",
    email: "managed.admin@example.com",
    role: "superuser",
    status: "active",
    passwordHash: null,
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: null,
    lastLoginAt: null,
  };
  const listPageCalls: Array<Record<string, unknown>> = [];

  const storage = {
    getUser: async (userId: string) => (userId === actor.id ? actor : null),
    getUserByUsername: async (username: string) => (username === actor.username ? actor : null),
    getManagedUsers: async () => [],
    listManagedUsersPage: async (params: Record<string, unknown>) => {
      listPageCalls.push(params);
      return {
        users: [
          {
            id: "managed-1",
            username: "alpha.admin",
            fullName: "Alpha Admin",
            email: "alpha.admin@example.com",
            role: "admin",
            status: "active",
            mustChangePassword: false,
            passwordResetBySuperuser: false,
            createdBy: "system",
            createdAt: new Date("2026-03-01T00:00:00.000Z"),
            updatedAt: new Date("2026-03-02T00:00:00.000Z"),
            activatedAt: new Date("2026-03-01T00:00:00.000Z"),
            lastLoginAt: null,
            passwordChangedAt: null,
            isBanned: false,
          },
        ],
        page: Number(params.page || 1),
        pageSize: Number(params.pageSize || 50),
        total: 31,
        totalPages: 3,
      };
    },
  } as unknown as PostgresStorage;

  return { storage, actor, listPageCalls };
}

export function createPendingResetPageStorageDouble() {
  const actor = {
    id: "superuser-reset-1",
    username: "reset.admin",
    fullName: "Reset Admin",
    email: "reset.admin@example.com",
    role: "superuser",
    status: "active",
    passwordHash: null,
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: null,
    lastLoginAt: null,
  };
  const listPageCalls: Array<Record<string, unknown>> = [];

  const storage = {
    getUser: async (userId: string) => (userId === actor.id ? actor : null),
    getUserByUsername: async (username: string) => (username === actor.username ? actor : null),
    listPendingPasswordResetRequests: async () => [],
    listPendingPasswordResetRequestsPage: async (params: Record<string, unknown>) => {
      listPageCalls.push(params);
      return {
        requests: [
          {
            id: "reset-1",
            userId: "user-1",
            username: "user.alpha",
            fullName: "User Alpha",
            email: "user.alpha@example.com",
            role: "user",
            status: "active",
            isBanned: false,
            requestedByUser: "user.alpha",
            approvedBy: null,
            resetType: "email_link",
            createdAt: new Date("2026-03-20T00:00:00.000Z"),
            expiresAt: new Date("2026-03-21T00:00:00.000Z"),
            usedAt: null,
          },
        ],
        page: Number(params.page || 1),
        pageSize: Number(params.pageSize || 50),
        total: 7,
        totalPages: 2,
      };
    },
  } as unknown as PostgresStorage;

  return { storage, actor, listPageCalls };
}

export async function withDevMailOutboxFixture(
  run: (context: { outboxDir: string }) => Promise<void>,
) {
  const previousDir = process.env.MAIL_DEV_OUTBOX_DIR;
  const previousEnabled = process.env.MAIL_DEV_OUTBOX_ENABLED;
  const previousNodeEnv = process.env.NODE_ENV;
  const outboxDir = await mkdtemp(path.join(os.tmpdir(), "sqr-dev-mail-outbox-"));

  process.env.MAIL_DEV_OUTBOX_DIR = outboxDir;
  process.env.MAIL_DEV_OUTBOX_ENABLED = "1";
  delete process.env.NODE_ENV;

  try {
    await run({ outboxDir });
  } finally {
    if (previousDir === undefined) {
      delete process.env.MAIL_DEV_OUTBOX_DIR;
    } else {
      process.env.MAIL_DEV_OUTBOX_DIR = previousDir;
    }

    if (previousEnabled === undefined) {
      delete process.env.MAIL_DEV_OUTBOX_ENABLED;
    } else {
      process.env.MAIL_DEV_OUTBOX_ENABLED = previousEnabled;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    await rm(outboxDir, { recursive: true, force: true });
  }
}
