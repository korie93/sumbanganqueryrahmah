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
import { CollectionOspV7Operations } from "./collection-osp-v7-operations";

export class CollectionRecordService extends CollectionServiceSupport {
  private readonly readOperations: CollectionRecordReadOperations;
  private readonly mutationOperations: CollectionRecordMutationOperations;
  private readonly dailyOperations: CollectionDailyOperations;
  private readonly sourceMatchOperations: CollectionSourceMatchOperations;
  private readonly sourceGovernanceOperations: CollectionSourceGovernanceOperations;
  private readonly ospV7Operations: CollectionOspV7Operations;

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
    this.ospV7Operations = new CollectionOspV7Operations(
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

  listBillingPrincipalSavedTargets(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0]) {
    return this.ospV7Operations.listTargets(userInput);
  }

  getBillingPrincipalSavedTarget(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown) {
    return this.ospV7Operations.getTarget(userInput, targetId);
  }

  createBillingPrincipalSavedTarget(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], body: unknown) {
    return this.ospV7Operations.createTarget(userInput, body);
  }

  updateBillingPrincipalSavedTarget(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown, body: unknown) {
    return this.ospV7Operations.updateTarget(userInput, targetId, body);
  }

  deleteBillingPrincipalSavedTarget(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown, version: unknown) {
    return this.ospV7Operations.deleteTarget(userInput, targetId, version);
  }

  getBillingPrincipalTargetOverview(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown, revisionId: unknown, query: Record<string, unknown>) {
    return this.ospV7Operations.overview(userInput, targetId, revisionId, query);
  }

  listBillingPrincipalReconciliationCandidates(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown, revisionId: unknown, query: Record<string, unknown>) {
    return this.ospV7Operations.candidates(userInput, targetId, revisionId, query);
  }

  listBillingPrincipalReconciliations(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown, revisionId: unknown, query: Record<string, unknown>) {
    return this.ospV7Operations.reconciliations(userInput, targetId, revisionId, query);
  }

  createBillingPrincipalReconciliation(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown, revisionId: unknown, body: unknown, requestId?: unknown) {
    return this.ospV7Operations.createReconciliation(userInput, targetId, revisionId, body, requestId);
  }

  updateBillingPrincipalReconciliation(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown, revisionId: unknown, reconciliationId: unknown, body: unknown, requestId?: unknown) {
    return this.ospV7Operations.updateReconciliation(userInput, targetId, revisionId, reconciliationId, body, requestId);
  }

  voidBillingPrincipalReconciliation(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown, revisionId: unknown, reconciliationId: unknown, body: unknown, requestId?: unknown) {
    return this.ospV7Operations.voidReconciliation(userInput, targetId, revisionId, reconciliationId, body, requestId);
  }

  listBillingPrincipalReconciliationHistory(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown, revisionId: unknown, reconciliationId: unknown) {
    return this.ospV7Operations.history(userInput, targetId, revisionId, reconciliationId);
  }

  upsertBillingPrincipalClientResults(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown, revisionId: unknown, body: unknown) {
    return this.ospV7Operations.upsertClientResults(userInput, targetId, revisionId, body);
  }

  getBillingPrincipalCalendar(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown, revisionId: unknown, query: Record<string, unknown>) {
    return this.ospV7Operations.calendar(userInput, targetId, revisionId, query);
  }

  getBillingPrincipalDrilldown(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown, revisionId: unknown, query: Record<string, unknown>) {
    return this.ospV7Operations.drilldown(userInput, targetId, revisionId, query);
  }

  exportBillingPrincipalTarget(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], targetId: unknown, revisionId: unknown, query: Record<string, unknown>) {
    return this.ospV7Operations.exportReport(userInput, targetId, revisionId, query);
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
