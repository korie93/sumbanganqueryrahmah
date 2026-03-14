import type { AuthenticatedUser } from "../auth/guards";
import type { PostgresStorage } from "../storage-postgres";
import { CollectionAdminService } from "./collection/collection-admin.service";
import { CollectionNicknameService } from "./collection/collection-nickname.service";
import { CollectionRecordService } from "./collection/collection-record.service";
import type { ListQuery, SummaryQuery } from "./collection/collection-service-support";

export class CollectionService {
  private readonly adminService: CollectionAdminService;
  private readonly nicknameService: CollectionNicknameService;
  private readonly recordService: CollectionRecordService;

  constructor(storage: PostgresStorage) {
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

  getSummary(user: AuthenticatedUser | undefined, query: SummaryQuery) {
    return this.recordService.getSummary(user, query);
  }

  listRecords(user: AuthenticatedUser | undefined, query: ListQuery) {
    return this.recordService.listRecords(user, query);
  }

  getPurgeSummary(user: AuthenticatedUser | undefined) {
    return this.recordService.getPurgeSummary(user);
  }

  getNicknameSummary(user: AuthenticatedUser | undefined, query: ListQuery) {
    return this.recordService.getNicknameSummary(user, query);
  }

  purgeOldRecords(user: AuthenticatedUser | undefined, bodyRaw?: unknown) {
    return this.recordService.purgeOldRecords(user, bodyRaw);
  }

  updateRecord(user: AuthenticatedUser | undefined, idRaw: unknown, bodyRaw: unknown) {
    return this.recordService.updateRecord(user, idRaw, bodyRaw);
  }

  deleteRecord(user: AuthenticatedUser | undefined, idRaw: unknown) {
    return this.recordService.deleteRecord(user, idRaw);
  }
}
