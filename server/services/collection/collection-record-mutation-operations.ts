import type { AuthenticatedUser } from "../../auth/guards";
import type { CollectionStoragePort } from "./collection-service-support";
import { CollectionRecordPurgeOperations } from "./collection-record-purge-operations";
import { CollectionRecordWriteOperations } from "./collection-record-write-operations";

type RequireUserFn = (user?: AuthenticatedUser) => AuthenticatedUser;

export class CollectionRecordMutationOperations {
  private readonly writeOperations: CollectionRecordWriteOperations;
  private readonly purgeOperations: CollectionRecordPurgeOperations;

  constructor(storage: CollectionStoragePort, requireUser: RequireUserFn) {
    this.writeOperations = new CollectionRecordWriteOperations(storage, requireUser);
    this.purgeOperations = new CollectionRecordPurgeOperations(storage, requireUser);
  }

  async createRecord(userInput: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.writeOperations.createRecord(userInput, bodyRaw);
  }

  async purgeOldRecords(userInput: AuthenticatedUser | undefined, bodyRaw?: unknown) {
    return this.purgeOperations.purgeOldRecords(userInput, bodyRaw);
  }

  async updateRecord(
    userInput: AuthenticatedUser | undefined,
    idRaw: unknown,
    bodyRaw: unknown,
  ) {
    return this.writeOperations.updateRecord(userInput, idRaw, bodyRaw);
  }

  async deleteRecord(
    userInput: AuthenticatedUser | undefined,
    idRaw: unknown,
    bodyRaw?: unknown,
  ) {
    return this.writeOperations.deleteRecord(userInput, idRaw, bodyRaw);
  }
}
