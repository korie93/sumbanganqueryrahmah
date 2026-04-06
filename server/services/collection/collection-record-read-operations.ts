import {
  CollectionServiceSupport,
  type ListQuery,
  type SummaryQuery,
} from "./collection-service-support";
import { CollectionRecordListReadOperations } from "./collection-record-list-read-operations";
import { CollectionRecordNicknameSummaryOperations } from "./collection-record-nickname-summary-operations";
import { CollectionRecordSummaryReadOperations } from "./collection-record-summary-read-operations";

export class CollectionRecordReadOperations {
  private readonly summaryOperations: CollectionRecordSummaryReadOperations;
  private readonly listOperations: CollectionRecordListReadOperations;
  private readonly nicknameSummaryOperations: CollectionRecordNicknameSummaryOperations;

  constructor(storage: CollectionServiceSupport["storage"]) {
    this.summaryOperations = new CollectionRecordSummaryReadOperations(storage);
    this.listOperations = new CollectionRecordListReadOperations(storage);
    this.nicknameSummaryOperations = new CollectionRecordNicknameSummaryOperations(storage);
  }

  async getSummary(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], query: SummaryQuery) {
    return this.summaryOperations.getSummary(userInput, query);
  }

  async listRecords(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], query: ListQuery) {
    return this.listOperations.listRecords(userInput, query);
  }

  async getPurgeSummary(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0]) {
    return this.summaryOperations.getPurgeSummary(userInput);
  }

  async getNicknameSummary(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: ListQuery,
  ) {
    return this.nicknameSummaryOperations.getNicknameSummary(userInput, query);
  }
}
