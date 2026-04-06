import type { AuthenticatedUser } from "../../auth/guards";
import type { CollectionStoragePort } from "./collection-service-support";
import { CollectionRecordCreateOperations } from "./collection-record-create-operations";
import { CollectionRecordDeleteOperations } from "./collection-record-delete-operations";
import { CollectionRecordUpdateOperations } from "./collection-record-update-operations";
import type { RequireUserFn } from "./collection-record-write-shared";

export class CollectionRecordWriteOperations {
  private readonly createOperations: CollectionRecordCreateOperations;
  private readonly updateOperations: CollectionRecordUpdateOperations;
  private readonly deleteOperations: CollectionRecordDeleteOperations;

  constructor(
    storage: CollectionStoragePort,
    requireUser: RequireUserFn,
  ) {
    this.createOperations = new CollectionRecordCreateOperations(storage, requireUser);
    this.updateOperations = new CollectionRecordUpdateOperations(storage, requireUser);
    this.deleteOperations = new CollectionRecordDeleteOperations(storage, requireUser);
  }

  async createRecord(userInput: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.createOperations.createRecord(userInput, bodyRaw);
  }

  async updateRecord(
    userInput: AuthenticatedUser | undefined,
    idRaw: unknown,
    bodyRaw: unknown,
  ) {
    return this.updateOperations.updateRecord(userInput, idRaw, bodyRaw);
  }

  async deleteRecord(
    userInput: AuthenticatedUser | undefined,
    idRaw: unknown,
    bodyRaw?: unknown,
  ) {
    return this.deleteOperations.deleteRecord(userInput, idRaw, bodyRaw);
  }
}
