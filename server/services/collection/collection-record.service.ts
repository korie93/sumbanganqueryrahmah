import {
  CollectionServiceSupport,
  type ListQuery,
  type SummaryQuery,
} from "./collection-service-support";
import { CollectionRecordReadOperations } from "./collection-record-read-operations";
import { CollectionRecordMutationOperations } from "./collection-record-mutation-operations";
import { CollectionDailyOperations } from "./collection-daily-operations";
import { CollectionSourceMatchOperations } from "./collection-source-match-operations";
import { CollectionSourceGovernanceOperations } from "./collection-source-governance-operations";

export class CollectionRecordService extends CollectionServiceSupport {
  private readonly readOperations: CollectionRecordReadOperations;
  private readonly mutationOperations: CollectionRecordMutationOperations;
  private readonly dailyOperations: CollectionDailyOperations;
  private readonly sourceMatchOperations: CollectionSourceMatchOperations;
  private readonly sourceGovernanceOperations: CollectionSourceGovernanceOperations;

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
    this.sourceMatchOperations = new CollectionSourceMatchOperations(
      this.storage,
      this.requireUser.bind(this),
    );
    this.sourceGovernanceOperations = new CollectionSourceGovernanceOperations(
      this.storage,
      this.requireUser.bind(this),
    );
  }

  async createRecord(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], bodyRaw: unknown) {
    return this.mutationOperations.createRecord(userInput, bodyRaw);
  }

  async listSourceMatches(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    bodyRaw: unknown,
  ) {
    return this.sourceMatchOperations.listMatches(userInput, bodyRaw);
  }

  async listSourceFiles(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    queryRaw: Record<string, unknown>,
  ) {
    return this.sourceMatchOperations.listSourceFiles(userInput, queryRaw);
  }

  async listSourceConfigs(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
  ) {
    return this.sourceGovernanceOperations.listSourceConfigs(userInput);
  }

  async getSourceConfig(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    sourceImportIdRaw: unknown,
  ) {
    return this.sourceGovernanceOperations.getSourceConfig(userInput, sourceImportIdRaw);
  }

  async configureSource(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    sourceImportIdRaw: unknown,
    bodyRaw: unknown,
  ) {
    return this.sourceGovernanceOperations.configureSource(userInput, sourceImportIdRaw, bodyRaw);
  }

  async deleteSourceConfig(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    sourceImportIdRaw: unknown,
  ) {
    return this.sourceGovernanceOperations.deleteSourceConfig(userInput, sourceImportIdRaw);
  }

  async getBillingPrincipalReport(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    queryRaw: Record<string, unknown>,
  ) {
    return this.sourceGovernanceOperations.getBillingPrincipalReport(userInput, queryRaw);
  }

  async getBillingPrincipalTargets(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    queryRaw: Record<string, unknown>,
  ) {
    return this.sourceGovernanceOperations.getBillingPrincipalTargets(userInput, queryRaw);
  }

  async upsertBillingPrincipalTargets(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    bodyRaw: unknown,
  ) {
    return this.sourceGovernanceOperations.upsertBillingPrincipalTargets(userInput, bodyRaw);
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

  async getMonthlyComparison(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: SummaryQuery,
  ) {
    return this.readOperations.getMonthlyComparison(userInput, query);
  }

  async getMonthlyTarget(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: SummaryQuery,
  ) {
    return this.dailyOperations.getMonthlyTarget(userInput, query);
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

  async deleteDailyCalendar(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    inputRaw: unknown,
  ) {
    return this.dailyOperations.deleteDailyCalendar(userInput, inputRaw);
  }

  async listDailyCalendarAudit(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: ListQuery,
  ) {
    return this.dailyOperations.listDailyCalendarAudit(userInput, query);
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
