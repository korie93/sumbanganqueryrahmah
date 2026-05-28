import assert from "node:assert/strict";
import test from "node:test";
import type { RequestHandler } from "express";
import type { AuthenticatedUser } from "../../auth/guards";
import type { CollectionStoragePort } from "../../services/collection/collection-service-support";
import {
  createAuthorizeCollectionRecordAccess,
  createRequireCollectionRecordAccess,
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
): CollectionRecordLookupResult {
  return {
    createdByLogin,
    collectionStaffNickname,
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
