import {
  CollectionServiceSupport,
  type ListQuery,
  type SummaryQuery,
} from "./collection-service-support";
import { CollectionRecordReadOperations } from "./collection-record-read-operations";
import { CollectionRecordMutationOperations } from "./collection-record-mutation-operations";
import { CollectionDailyOperations } from "./collection-daily-operations";

export class CollectionRecordService extends CollectionServiceSupport {
  private readonly readOperations: CollectionRecordReadOperations;
  private readonly mutationOperations: CollectionRecordMutationOperations;
  private readonly dailyOperations: CollectionDailyOperations;

  constructor(storage: ConstructorParameters<typeof CollectionServiceSupport>[0]) {
    super(storage);
    this.readOperations = new CollectionRecordReadOperations(this.storage);
    this.mutationOperations = new CollectionRecordMutationOperations(
      this.storage,
      this.requireUser.bind(this),
    );
    this.dailyOperations = new CollectionDailyOperations(
      this.storage,
      this.requireUser.bind(this),
    );
  }

  async createRecord(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], bodyRaw: unknown) {
    return this.mutationOperations.createRecord(userInput, bodyRaw);
  }

  async getSummary(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], query: SummaryQuery) {
    return this.readOperations.getSummary(userInput, query);
  }

  async listRecords(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], query: ListQuery) {
    return this.readOperations.listRecords(userInput, query);
  }

  async getPurgeSummary(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0]) {
    return this.readOperations.getPurgeSummary(userInput);
  }

  async getNicknameSummary(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: ListQuery,
  ) {
    return this.readOperations.getNicknameSummary(userInput, query);
  }

  async listDailyUsers(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0]) {
    return this.dailyOperations.listDailyUsers(userInput);
  }

  async upsertDailyTarget(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    bodyRaw: unknown,
  ) {
    return this.dailyOperations.upsertDailyTarget(userInput, bodyRaw);
  }

  async upsertDailyCalendar(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    bodyRaw: unknown,
  ) {
    return this.dailyOperations.upsertDailyCalendar(userInput, bodyRaw);
  }

  async getDailyOverview(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: ListQuery,
  ) {
    return this.dailyOperations.getDailyOverview(userInput, query);
  }

  async getDailyDayDetails(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: ListQuery,
  ) {
    return this.dailyOperations.getDailyDayDetails(userInput, query);
  }

  async purgeOldRecords(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    bodyRaw?: unknown,
  ) {
    return this.mutationOperations.purgeOldRecords(userInput, bodyRaw);
  }

  async updateRecord(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    idRaw: unknown,
    bodyRaw: unknown,
  ) {
    return this.mutationOperations.updateRecord(userInput, idRaw, bodyRaw);
  }

  async deleteRecord(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    idRaw: unknown,
    bodyRaw?: unknown,
  ) {
    return this.mutationOperations.deleteRecord(userInput, idRaw, bodyRaw);
  }
}
