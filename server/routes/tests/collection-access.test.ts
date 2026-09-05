import assert from "node:assert/strict";
import test from "node:test";
import type { RequestHandler } from "express";
import type { AuthenticatedUser } from "../../auth/guards";
import type { CollectionStoragePort } from "../../services/collection/collection-service-support";
import {
  createAuthorizeCollectionRecordAccess,
  createRequireCollectionRecordAccess,
  getAccessibleCollectionRecordOrThrow,
} from "../collection-access";

type CollectionRecordLookupResult = Awaited<
  ReturnType<CollectionStoragePort["getCollectionRecordById"]>
>;

type CapturedHttpError = Error & {
  statusCode?: number;
};

const ownerUser: AuthenticatedUser = {
  activityId: "",
  role: "user",
  username: "alice",
};

function collectionRecord(
  createdByLogin: string | null,
  collectionStaffNickname: string | null,
  cardNumber?: string,
): CollectionRecordLookupResult {
  return {
    createdByLogin,
    collectionStaffNickname,
    ...(cardNumber === undefined ? {} : { cardNumber }),
  } as unknown as CollectionRecordLookupResult;
}

function createStorage(record: CollectionRecordLookupResult): CollectionStoragePort {
  const storage: Partial<CollectionStoragePort> = {
    getCollectionRecordById: async () => record,
  };
  return storage as CollectionStoragePort;
}

function createRequest(params: Record<string, string>, user?: AuthenticatedUser): Parameters<RequestHandler>[0] {
  return {
    params,
    user,
  } as unknown as Parameters<RequestHandler>[0];
}

test("createAuthorizeCollectionRecordAccess allows owned collection records", async () => {
  const authorize = createAuthorizeCollectionRecordAccess({
    storage: createStorage(collectionRecord("alice", "team-a")),
  });

  await authorize(createRequest({ id: "record-1" }, ownerUser));
});

test("createAuthorizeCollectionRecordAccess rejects records outside the current user scope", async () => {
  const authorize = createAuthorizeCollectionRecordAccess({
    storage: createStorage(collectionRecord("bob", "team-b")),
  });

  await assert.rejects(
    () => authorize(createRequest({ id: "record-1" }, ownerUser)),
    (error: unknown) => {
      assert.equal((error as CapturedHttpError).statusCode, 403);
      return true;
    },
  );
});

test("createAuthorizeCollectionRecordAccess fails closed for banned collection users", async () => {
  const authorize = createAuthorizeCollectionRecordAccess({
    storage: createStorage(collectionRecord("alice", "team-a")),
  });

  await assert.rejects(
    () => authorize(createRequest({ id: "record-1" }, {
      ...ownerUser,
      isBanned: true,
      status: "active",
    })),
    (error: unknown) => {
      assert.equal((error as CapturedHttpError).statusCode, 403);
      return true;
    },
  );
});

test("createAuthorizeCollectionRecordAccess fails closed for inactive or expired session snapshots", async () => {
  const authorize = createAuthorizeCollectionRecordAccess({
    storage: createStorage(collectionRecord("alice", "team-a")),
  });

  await assert.rejects(
    () => authorize(createRequest({ id: "record-1" }, {
      ...ownerUser,
      sessionExpiresAt: "2026-01-01T00:00:00.000Z",
      status: "active",
    })),
    (error: unknown) => {
      assert.equal((error as CapturedHttpError).statusCode, 403);
      return true;
    },
  );

  await assert.rejects(
    () => authorize(createRequest({ id: "record-1" }, {
      ...ownerUser,
      sessionExpiresAt: "2999-01-01T00:00:00.000Z",
      status: "disabled",
    })),
    (error: unknown) => {
      assert.equal((error as CapturedHttpError).statusCode, 403);
      return true;
    },
  );
});

test("createAuthorizeCollectionRecordAccess rejects missing records without leaking existence details", async () => {
  const authorize = createAuthorizeCollectionRecordAccess({
    storage: createStorage(undefined),
  });

  await assert.rejects(
    () => authorize(createRequest({ id: "record-404" }, ownerUser)),
    (error: unknown) => {
      assert.equal((error as CapturedHttpError).statusCode, 404);
      return true;
    },
  );
});

test("createRequireCollectionRecordAccess forwards authorization errors through Express next", async () => {
  const middleware = createRequireCollectionRecordAccess({
    storage: createStorage(collectionRecord("bob", "team-b")),
  });
  const req = createRequest({ id: "record-1" }, ownerUser);

  const nextError = await new Promise<unknown>((resolve) => {
    middleware(req, {} as Parameters<RequestHandler>[1], (error?: unknown) => {
      resolve(error);
    });
  });

  assert.equal((nextError as CapturedHttpError).statusCode, 403);
});

test("createRequireCollectionRecordAccess calls next without an error for authorized records", async () => {
  const middleware = createRequireCollectionRecordAccess({
    storage: createStorage(collectionRecord("alice", "team-a")),
  });
  const req = createRequest({ id: "record-1" }, ownerUser);

  const nextError = await new Promise<unknown>((resolve) => {
    middleware(req, {} as Parameters<RequestHandler>[1], (error?: unknown) => {
      resolve(error);
    });
  });

  assert.equal(nextError, undefined);
});

test("full Card No is returned unchanged only after each role's existing row authorization", async () => {
  const fullCardNumber = "00004377044001076221";
  const record = collectionRecord("alice", "team-a", fullCardNumber);
  const storage = {
    getCollectionRecordById: async () => record,
    getCollectionNicknameSessionByActivity: async (activityId: string) => activityId === "admin-activity"
      ? {
          username: "admin.one",
          userRole: "admin",
          nickname: "admin.leader",
        }
      : undefined,
    getCollectionAdminGroupVisibleNicknameValuesByLeader: async () => ["team-a"],
  } as unknown as CollectionStoragePort;

  const authorizedUsers: AuthenticatedUser[] = [
    { role: "superuser", username: "root", activityId: "root-activity" },
    { role: "manager", username: "manager.one", activityId: "manager-activity" },
    { role: "admin", username: "admin.one", activityId: "admin-activity" },
    { role: "user", username: "alice", activityId: "" },
  ];
  for (const user of authorizedUsers) {
    const accessible = await getAccessibleCollectionRecordOrThrow(storage, user, "record-1");
    assert.equal(accessible.cardNumber, fullCardNumber, user.role);
    assert.equal(typeof accessible.cardNumber, "string", user.role);
  }

  await assert.rejects(
    getAccessibleCollectionRecordOrThrow(
      storage,
      { role: "user", username: "mallory", activityId: "" },
      "record-1",
    ),
    (error: unknown) => {
      assert.equal((error as CapturedHttpError).statusCode, 403);
      return true;
    },
  );
});
