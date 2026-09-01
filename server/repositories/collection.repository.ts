import {
  createCollectionAdminGroupRepository,
  deleteCollectionAdminGroupRepository,
  getCollectionAdminAssignedNicknameIdsRepository,
  getCollectionAdminGroupByIdRepository,
  getCollectionAdminGroupsRepository,
  getCollectionAdminGroupVisibleNicknameValuesByLeaderRepository,
  getCollectionAdminUserByIdRepository,
  getCollectionAdminUsersRepository,
  getCollectionAdminVisibleNicknamesRepository,
  setCollectionAdminAssignedNicknameIdsRepository,
  updateCollectionAdminGroupRepository,
} from "./collection-repository-admin-operations";
import {
  deleteCollectionDailyCalendarDayRepository,
  getCollectionDailyTargetRepository,
  listCollectionDailyCalendarAuditRepository,
  listCollectionDailyCalendarRepository,
  listCollectionDailyPaidCustomersRepository,
  listCollectionDailyUsersRepository,
  upsertCollectionDailyCalendarDaysRepository,
  upsertCollectionDailyTargetRepository,
} from "./collection-repository-daily-operations";
import {
  clearCollectionNicknameSessionByActivityRepository,
  createCollectionStaffNicknameRepository,
  deleteCollectionStaffNicknameRepository,
  getCollectionNicknameAuthProfileByNameRepository,
  getCollectionNicknameSessionByActivityRepository,
  getCollectionStaffNicknameByIdRepository,
  getCollectionStaffNicknameByNameRepository,
  getCollectionStaffNicknamesRepository,
  isCollectionStaffNicknameActiveRepository,
  setCollectionNicknamePasswordRepository,
  setCollectionNicknameSessionRepository,
  updateCollectionStaffNicknameRepository,
} from "./collection-repository-nickname-operations";
import {
  createCollectionRecordRepository,
  getCollectionMonthlyComparisonRepository,
  deleteCollectionRecordRepository,
  getCollectionMonthlySummaryRepository,
  getCollectionRecordByIdRepository,
  getCollectionRecordDailyRollupFreshnessRepository,
  listCollectionRecordsRepository,
  purgeCollectionRecordsOlderThanRepository,
  summarizeCollectionRecordsByNicknameAndPaymentDateRepository,
  summarizeCollectionRecordsByNicknameRepository,
  summarizeCollectionRecordsOlderThanRepository,
  summarizeCollectionRecordsRepository,
  updateCollectionRecordRepository,
} from "./collection-repository-record-operations";
import {
  createCollectionRecordReceiptsRepository,
  deleteAllCollectionRecordReceiptsRepository,
  deleteCollectionRecordReceiptsRepository,
  findCollectionReceiptDuplicateSummariesRepository,
  getCollectionRecordReceiptByIdRepository,
  listCollectionRecordReceiptsRepository,
  syncCollectionRecordReceiptValidationRepository,
  updateCollectionRecordReceiptsRepository,
} from "./collection-repository-receipt-operations";
import {
  configureCollectionSource,
  deleteCollectionSource,
  findEligibleCollectionSourceMatches,
  getCollectionBillingPrincipalReport,
  getCollectionSourceConfig,
  listCollectionSourceConfigs,
  upsertCollectionOspTargets,
} from "./collection-source-repository-utils";
import { backfillLegacyCollectionRecordsForSource } from "./collection-source-legacy-backfill-utils";

export class CollectionRepository {
  readonly backfillLegacyCollectionRecordsForSource = backfillLegacyCollectionRecordsForSource;
  readonly clearCollectionNicknameSessionByActivity = clearCollectionNicknameSessionByActivityRepository;
  readonly configureCollectionSource = configureCollectionSource;
  readonly createCollectionAdminGroup = createCollectionAdminGroupRepository;
  readonly createCollectionRecord = createCollectionRecordRepository;
  readonly createCollectionRecordReceipts = createCollectionRecordReceiptsRepository;
  readonly createCollectionStaffNickname = createCollectionStaffNicknameRepository;
  readonly deleteAllCollectionRecordReceipts = deleteAllCollectionRecordReceiptsRepository;
  readonly deleteCollectionAdminGroup = deleteCollectionAdminGroupRepository;
  readonly deleteCollectionRecord = deleteCollectionRecordRepository;
  readonly deleteCollectionRecordReceipts = deleteCollectionRecordReceiptsRepository;
  readonly deleteCollectionStaffNickname = deleteCollectionStaffNicknameRepository;
  readonly deleteCollectionDailyCalendarDay = deleteCollectionDailyCalendarDayRepository;
  readonly deleteCollectionSource = deleteCollectionSource;
  readonly findCollectionReceiptDuplicateSummaries = findCollectionReceiptDuplicateSummariesRepository;
  readonly findEligibleCollectionSourceMatches = findEligibleCollectionSourceMatches;
  readonly getCollectionAdminAssignedNicknameIds = getCollectionAdminAssignedNicknameIdsRepository;
  readonly getCollectionAdminGroupById = getCollectionAdminGroupByIdRepository;
  readonly getCollectionAdminGroups = getCollectionAdminGroupsRepository;
  readonly getCollectionAdminGroupVisibleNicknameValuesByLeader =
    getCollectionAdminGroupVisibleNicknameValuesByLeaderRepository;
  readonly getCollectionAdminUserById = getCollectionAdminUserByIdRepository;
  readonly getCollectionAdminUsers = getCollectionAdminUsersRepository;
  readonly getCollectionAdminVisibleNicknames = getCollectionAdminVisibleNicknamesRepository;
  readonly getCollectionDailyTarget = getCollectionDailyTargetRepository;
  readonly getCollectionBillingPrincipalReport = getCollectionBillingPrincipalReport;
  readonly getCollectionMonthlyComparison = getCollectionMonthlyComparisonRepository;
  readonly getCollectionMonthlySummary = getCollectionMonthlySummaryRepository;
  readonly getCollectionNicknameAuthProfileByName = getCollectionNicknameAuthProfileByNameRepository;
  readonly getCollectionNicknameSessionByActivity = getCollectionNicknameSessionByActivityRepository;
  readonly getCollectionRecordById = getCollectionRecordByIdRepository;
  readonly getCollectionRecordDailyRollupFreshness = getCollectionRecordDailyRollupFreshnessRepository;
  readonly getCollectionRecordReceiptById = getCollectionRecordReceiptByIdRepository;
  readonly getCollectionStaffNicknameById = getCollectionStaffNicknameByIdRepository;
  readonly getCollectionStaffNicknameByName = getCollectionStaffNicknameByNameRepository;
  readonly getCollectionStaffNicknames = getCollectionStaffNicknamesRepository;
  readonly getCollectionSourceConfig = getCollectionSourceConfig;
  readonly isCollectionStaffNicknameActive = isCollectionStaffNicknameActiveRepository;
  readonly listCollectionDailyCalendar = listCollectionDailyCalendarRepository;
  readonly listCollectionDailyCalendarAudit = listCollectionDailyCalendarAuditRepository;
  readonly listCollectionDailyPaidCustomers = listCollectionDailyPaidCustomersRepository;
  readonly listCollectionDailyUsers = listCollectionDailyUsersRepository;
  readonly listCollectionRecordReceipts = listCollectionRecordReceiptsRepository;
  readonly listCollectionRecords = listCollectionRecordsRepository;
  readonly listCollectionSourceConfigs = listCollectionSourceConfigs;
  readonly purgeCollectionRecordsOlderThan = purgeCollectionRecordsOlderThanRepository;
  readonly setCollectionAdminAssignedNicknameIds = setCollectionAdminAssignedNicknameIdsRepository;
  readonly setCollectionNicknamePassword = setCollectionNicknamePasswordRepository;
  readonly setCollectionNicknameSession = setCollectionNicknameSessionRepository;
  readonly summarizeCollectionRecords = summarizeCollectionRecordsRepository;
  readonly summarizeCollectionRecordsByNickname = summarizeCollectionRecordsByNicknameRepository;
  readonly summarizeCollectionRecordsByNicknameAndPaymentDate =
    summarizeCollectionRecordsByNicknameAndPaymentDateRepository;
  readonly summarizeCollectionRecordsOlderThan = summarizeCollectionRecordsOlderThanRepository;
  readonly syncCollectionRecordReceiptValidation = syncCollectionRecordReceiptValidationRepository;
  readonly updateCollectionAdminGroup = updateCollectionAdminGroupRepository;
  readonly updateCollectionRecord = updateCollectionRecordRepository;
  readonly updateCollectionRecordReceipts = updateCollectionRecordReceiptsRepository;
  readonly updateCollectionStaffNickname = updateCollectionStaffNicknameRepository;
  readonly upsertCollectionDailyCalendarDays = upsertCollectionDailyCalendarDaysRepository;
  readonly upsertCollectionDailyTarget = upsertCollectionDailyTargetRepository;
  readonly upsertCollectionOspTargets = upsertCollectionOspTargets;
}
