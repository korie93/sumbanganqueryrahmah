import type { AuthenticatedUser } from "../auth/guards";
import { CollectionAdminService } from "./collection/collection-admin.service";
import { CollectionNicknameService } from "./collection/collection-nickname.service";
import { CollectionRecordService } from "./collection/collection-record.service";
import type {
  CollectionStoragePort,
  ListQuery,
  SummaryQuery,
} from "./collection/collection-service-support";

export class CollectionService {
  private readonly adminService: CollectionAdminService;
  private readonly nicknameService: CollectionNicknameService;
  private readonly recordService: CollectionRecordService;

  constructor(storage: CollectionStoragePort) {
    this.adminService = new CollectionAdminService(storage);
    this.nicknameService = new CollectionNicknameService(storage);
    this.recordService = new CollectionRecordService(storage);
  }

  listNicknames(user: AuthenticatedUser | undefined, includeInactiveRaw: unknown) {
    return this.nicknameService.listNicknames(user, includeInactiveRaw);
  }

  checkNicknameAuth(user: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.nicknameService.checkNicknameAuth(user, bodyRaw);
  }

  setupNicknamePassword(user: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.nicknameService.setupNicknamePassword(user, bodyRaw);
  }

  loginNickname(user: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.nicknameService.loginNickname(user, bodyRaw);
  }

  listAdmins() {
    return this.adminService.listAdmins();
  }

  listAdminGroups() {
    return this.adminService.listAdminGroups();
  }

  getNicknameSession(user: AuthenticatedUser | undefined) {
    return this.nicknameService.getNicknameSession(user);
  }

  listTeamOptions(user: AuthenticatedUser | undefined) {
    return this.adminService.listTeamOptions(user);
  }

  createAdminGroup(user: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.adminService.createAdminGroup(user, bodyRaw);
  }

  updateAdminGroup(user: AuthenticatedUser | undefined, groupIdRaw: unknown, bodyRaw: unknown) {
    return this.adminService.updateAdminGroup(user, groupIdRaw, bodyRaw);
  }

  deleteAdminGroup(user: AuthenticatedUser | undefined, groupIdRaw: unknown) {
    return this.adminService.deleteAdminGroup(user, groupIdRaw);
  }

  getNicknameAssignments(adminIdRaw: unknown) {
    return this.adminService.getNicknameAssignments(adminIdRaw);
  }

  setNicknameAssignments(user: AuthenticatedUser | undefined, adminIdRaw: unknown, bodyRaw: unknown) {
    return this.adminService.setNicknameAssignments(user, adminIdRaw, bodyRaw);
  }

  createNickname(user: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.nicknameService.createNickname(user, bodyRaw);
  }

  updateNickname(user: AuthenticatedUser | undefined, idRaw: unknown, bodyRaw: unknown) {
    return this.nicknameService.updateNickname(user, idRaw, bodyRaw);
  }

  updateNicknameStatus(user: AuthenticatedUser | undefined, idRaw: unknown, bodyRaw: unknown) {
    return this.nicknameService.updateNicknameStatus(user, idRaw, bodyRaw);
  }

  resetNicknamePassword(user: AuthenticatedUser | undefined, idRaw: unknown) {
    return this.nicknameService.resetNicknamePassword(user, idRaw);
  }

  deleteNickname(user: AuthenticatedUser | undefined, idRaw: unknown) {
    return this.nicknameService.deleteNickname(user, idRaw);
  }

  createRecord(user: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.recordService.createRecord(user, bodyRaw);
  }

  listSourceMatches(user: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.recordService.listSourceMatches(user, bodyRaw);
  }

  listSourceFiles(user: AuthenticatedUser | undefined, queryRaw: Record<string, unknown>) {
    return this.recordService.listSourceFiles(user, queryRaw);
  }

  listSourceConfigs(user: AuthenticatedUser | undefined) {
    return this.recordService.listSourceConfigs(user);
  }

  getSourceConfig(user: AuthenticatedUser | undefined, sourceImportIdRaw: unknown) {
    return this.recordService.getSourceConfig(user, sourceImportIdRaw);
  }

  configureSource(
    user: AuthenticatedUser | undefined,
    sourceImportIdRaw: unknown,
    bodyRaw: unknown,
  ) {
    return this.recordService.configureSource(user, sourceImportIdRaw, bodyRaw);
  }

  deleteSourceConfig(user: AuthenticatedUser | undefined, sourceImportIdRaw: unknown) {
    return this.recordService.deleteSourceConfig(user, sourceImportIdRaw);
  }

  getBillingPrincipalReport(
    user: AuthenticatedUser | undefined,
    queryRaw: Record<string, unknown>,
  ) {
    return this.recordService.getBillingPrincipalReport(user, queryRaw);
  }

  getBillingPrincipalTargets(
    user: AuthenticatedUser | undefined,
    queryRaw: Record<string, unknown>,
  ) {
    return this.recordService.getBillingPrincipalTargets(user, queryRaw);
  }

  upsertBillingPrincipalTargets(user: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.recordService.upsertBillingPrincipalTargets(user, bodyRaw);
  }

  listBillingPrincipalSavedTargets(user: AuthenticatedUser | undefined) {
    return this.recordService.listBillingPrincipalSavedTargets(user);
  }

  getBillingPrincipalSavedTarget(user: AuthenticatedUser | undefined, targetId: unknown) {
    return this.recordService.getBillingPrincipalSavedTarget(user, targetId);
  }

  createBillingPrincipalSavedTarget(user: AuthenticatedUser | undefined, body: unknown) {
    return this.recordService.createBillingPrincipalSavedTarget(user, body);
  }

  updateBillingPrincipalSavedTarget(user: AuthenticatedUser | undefined, targetId: unknown, body: unknown) {
    return this.recordService.updateBillingPrincipalSavedTarget(user, targetId, body);
  }

  deleteBillingPrincipalSavedTarget(user: AuthenticatedUser | undefined, targetId: unknown, version: unknown) {
    return this.recordService.deleteBillingPrincipalSavedTarget(user, targetId, version);
  }

  getBillingPrincipalTargetOverview(user: AuthenticatedUser | undefined, targetId: unknown, revisionId: unknown, query: Record<string, unknown>) {
    return this.recordService.getBillingPrincipalTargetOverview(user, targetId, revisionId, query);
  }

  upsertBillingPrincipalClientResults(user: AuthenticatedUser | undefined, targetId: unknown, revisionId: unknown, body: unknown) {
    return this.recordService.upsertBillingPrincipalClientResults(user, targetId, revisionId, body);
  }

  getBillingPrincipalCalendar(user: AuthenticatedUser | undefined, targetId: unknown, revisionId: unknown, query: Record<string, unknown>) {
    return this.recordService.getBillingPrincipalCalendar(user, targetId, revisionId, query);
  }

  getBillingPrincipalDrilldown(user: AuthenticatedUser | undefined, targetId: unknown, revisionId: unknown, query: Record<string, unknown>) {
    return this.recordService.getBillingPrincipalDrilldown(user, targetId, revisionId, query);
  }

  exportBillingPrincipalTarget(user: AuthenticatedUser | undefined, targetId: unknown, revisionId: unknown, query: Record<string, unknown>) {
    return this.recordService.exportBillingPrincipalTarget(user, targetId, revisionId, query);
  }

  getSummary(user: AuthenticatedUser | undefined, query: SummaryQuery) {
    return this.recordService.getSummary(user, query);
  }

  listRecords(user: AuthenticatedUser | undefined, query: ListQuery) {
    return this.recordService.listRecords(user, query);
  }

  getPurgeSummary(user: AuthenticatedUser | undefined) {
    return this.recordService.getPurgeSummary(user);
  }

  getMonthlyComparison(user: AuthenticatedUser | undefined, query: SummaryQuery) {
    return this.recordService.getMonthlyComparison(user, query);
  }

  getMonthlyTarget(user: AuthenticatedUser | undefined, query: SummaryQuery) {
    return this.recordService.getMonthlyTarget(user, query);
  }

  getNicknameSummary(user: AuthenticatedUser | undefined, query: ListQuery) {
    return this.recordService.getNicknameSummary(user, query);
  }

  listDailyUsers(user: AuthenticatedUser | undefined) {
    return this.recordService.listDailyUsers(user);
  }

  upsertDailyTarget(user: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.recordService.upsertDailyTarget(user, bodyRaw);
  }

  upsertDailyCalendar(user: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.recordService.upsertDailyCalendar(user, bodyRaw);
  }

  deleteDailyCalendar(user: AuthenticatedUser | undefined, inputRaw: unknown) {
    return this.recordService.deleteDailyCalendar(user, inputRaw);
  }

  listDailyCalendarAudit(user: AuthenticatedUser | undefined, query: ListQuery) {
    return this.recordService.listDailyCalendarAudit(user, query);
  }

  getDailyOverview(user: AuthenticatedUser | undefined, query: ListQuery) {
    return this.recordService.getDailyOverview(user, query);
  }

  getDailyDayDetails(user: AuthenticatedUser | undefined, query: ListQuery) {
    return this.recordService.getDailyDayDetails(user, query);
  }

  purgeOldRecords(user: AuthenticatedUser | undefined, bodyRaw?: unknown) {
    return this.recordService.purgeOldRecords(user, bodyRaw);
  }

  updateRecord(user: AuthenticatedUser | undefined, idRaw: unknown, bodyRaw: unknown) {
    return this.recordService.updateRecord(user, idRaw, bodyRaw);
  }

  deleteRecord(user: AuthenticatedUser | undefined, idRaw: unknown, bodyRaw?: unknown) {
    return this.recordService.deleteRecord(user, idRaw, bodyRaw);
  }

  upsertManualSettlement(user: AuthenticatedUser | undefined, idRaw: unknown, bodyRaw: unknown) {
    return this.recordService.upsertManualSettlement(user, idRaw, bodyRaw);
  }

  revokeManualSettlement(user: AuthenticatedUser | undefined, idRaw: unknown, bodyRaw: unknown) {
    return this.recordService.revokeManualSettlement(user, idRaw, bodyRaw);
  }

  getManualSettlementHistory(user: AuthenticatedUser | undefined, idRaw: unknown, limitRaw?: unknown) {
    return this.recordService.getManualSettlementHistory(user, idRaw, limitRaw);
  }
}
