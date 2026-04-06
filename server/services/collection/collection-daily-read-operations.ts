import { badRequest } from "../../http/errors";
import type { AuthenticatedUser } from "../../auth/guards";
import { resolveCurrentCollectionNicknameFromSession } from "../../routes/collection-access";
import {
  isValidCollectionDate,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import { getCollectionDailyStatusMessage } from "./collection-daily-utils";
import { CollectionDailyOverviewService } from "./collection-daily-overview.service";
import type { CollectionStoragePort, ListQuery } from "./collection-service-support";
import { getCollectionReportFreshness } from "./collection-report-freshness";

type RequireUserFn = (user?: AuthenticatedUser) => AuthenticatedUser;

export class CollectionDailyReadOperations {
  private readonly dailyOverviewService: CollectionDailyOverviewService;

  constructor(
    private readonly storage: CollectionStoragePort,
    private readonly requireUser: RequireUserFn,
  ) {
    this.dailyOverviewService = new CollectionDailyOverviewService(this.storage);
  }

  async getDailyOverview(userInput: AuthenticatedUser | undefined, query: ListQuery) {
    const user = this.requireUser(userInput);
    const year = Number.parseInt(normalizeCollectionText(query.year), 10);
    const month = Number.parseInt(normalizeCollectionText(query.month), 10);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Invalid year.");
    if (!Number.isInteger(month) || month < 1 || month > 12) throw badRequest("Invalid month.");
    const computation = await this.dailyOverviewService.buildDailyOverviewComputation(user, year, month, query);
    const selectedUsernames = computation.selectedUsers.map((item) => item.username);
    const currentNickname = await resolveCurrentCollectionNicknameFromSession(this.storage, user as any);
    const freshness = await getCollectionReportFreshness(this.storage, {
      from: `${year}-${String(month).padStart(2, "0")}-01`,
      to: `${year}-${String(month).padStart(2, "0")}-${String(computation.daysInMonth).padStart(2, "0")}`,
      nicknames: selectedUsernames,
    });

    return {
      ok: true as const,
      username: selectedUsernames[0] || normalizeCollectionText(currentNickname) || user.username.toLowerCase(),
      usernames: selectedUsernames,
      role: computation.selectedUsers.length === 1 ? computation.selectedUsers[0].role : "mixed",
      month: {
        year,
        month,
        daysInMonth: computation.daysInMonth,
      },
      summary: computation.summary,
      days: computation.days,
      carryForwardRule:
        "Daily requirement is calculated from remaining target divided by remaining working days, capped by the monthly target.",
      freshness,
    };
  }

  async getDailyDayDetails(userInput: AuthenticatedUser | undefined, query: ListQuery) {
    const user = this.requireUser(userInput);
    const date = normalizeCollectionText(query.date);
    if (!date || !isValidCollectionDate(date)) throw badRequest("Invalid date.");

    const [yearText, monthText] = date.split("-");
    const year = Number.parseInt(yearText, 10);
    const month = Number.parseInt(monthText, 10);
    const pageRaw = Number.parseInt(normalizeCollectionText(query.page), 10);
    const pageSizeRaw = Number.parseInt(normalizeCollectionText(query.pageSize), 10);
    const pageSize = Number.isInteger(pageSizeRaw) ? Math.min(100, Math.max(1, pageSizeRaw)) : 10;
    const requestedPage = Number.isInteger(pageRaw) ? Math.max(1, pageRaw) : 1;

    const computation = await this.dailyOverviewService.buildDailyOverviewComputation(user, year, month, query);
    const selectedUsernames = computation.selectedUsers.map((item) => item.username);
    const dayOverview = computation.days.find((item) => item.date === date);
    if (!dayOverview) {
      throw badRequest("Date is outside selected month.");
    }

    const totalRecords = Math.max(0, Number(dayOverview.customerCount || 0));
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    const pagedRecords = await this.storage.listCollectionRecords({
      from: date,
      to: date,
      nicknames: selectedUsernames,
      limit: pageSize,
      offset,
    });
    const pagedCustomers = pagedRecords.map((record) => ({
      id: record.id,
      customerName: record.customerName,
      accountNumber: record.accountNumber,
      amount: Number(record.amount || 0),
      collectionStaffNickname: record.collectionStaffNickname,
    }));

    const status = dayOverview.status;
    const message = getCollectionDailyStatusMessage(status);
    const freshness = await getCollectionReportFreshness(this.storage, {
      from: date,
      to: date,
      nicknames: selectedUsernames,
    });

    return {
      ok: true as const,
      username: selectedUsernames[0] || normalizeCollectionText(
        await resolveCurrentCollectionNicknameFromSession(this.storage, user as any),
      ) || user.username.toLowerCase(),
      usernames: selectedUsernames,
      date,
      status,
      message,
      amount: dayOverview.amount,
      dailyTarget: dayOverview.target,
      customers: pagedCustomers,
      summary: {
        monthlyTarget: computation.summary.monthlyTarget,
        collected: computation.summary.collectedAmount,
        balanced: computation.summary.balancedAmount,
        totalForDate: dayOverview.amount,
        targetForDate: dayOverview.target,
      },
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      records: pagedRecords.map((record) => ({
        id: record.id,
        customerName: record.customerName,
        accountNumber: record.accountNumber,
        paymentDate: record.paymentDate,
        amount: Number(record.amount || 0),
        batch: record.batch,
        paymentReference: record.accountNumber,
        username: record.createdByLogin,
        collectionStaffNickname: record.collectionStaffNickname,
        createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : String(record.createdAt),
        receiptFile: record.receiptFile,
        receipts: (record.receipts || []).map((receipt) => ({
          id: receipt.id,
          storagePath: receipt.storagePath,
          originalFileName: receipt.originalFileName,
          originalMimeType: receipt.originalMimeType,
          fileSize: receipt.fileSize,
          createdAt: receipt.createdAt instanceof Date ? receipt.createdAt.toISOString() : String(receipt.createdAt),
        })),
      })),
      freshness,
    };
  }
}
