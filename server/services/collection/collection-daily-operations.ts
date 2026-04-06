import type { AuthenticatedUser } from "../../auth/guards";
import type { ListQuery, CollectionStoragePort } from "./collection-service-support";
import { CollectionDailyManagementOperations } from "./collection-daily-management-operations";
import { CollectionDailyReadOperations } from "./collection-daily-read-operations";

type RequireUserFn = (user?: AuthenticatedUser) => AuthenticatedUser;

export class CollectionDailyOperations {
  private readonly managementOperations: CollectionDailyManagementOperations;
  private readonly readOperations: CollectionDailyReadOperations;

  constructor(storage: CollectionStoragePort, requireUser: RequireUserFn) {
    this.managementOperations = new CollectionDailyManagementOperations(storage, requireUser);
    this.readOperations = new CollectionDailyReadOperations(storage, requireUser);
  }

  async listDailyUsers(userInput: AuthenticatedUser | undefined) {
    return this.managementOperations.listDailyUsers(userInput);
  }

  async upsertDailyTarget(userInput: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.managementOperations.upsertDailyTarget(userInput, bodyRaw);
  }

  async upsertDailyCalendar(userInput: AuthenticatedUser | undefined, bodyRaw: unknown) {
    return this.managementOperations.upsertDailyCalendar(userInput, bodyRaw);
  }

  async getDailyOverview(userInput: AuthenticatedUser | undefined, query: ListQuery) {
    return this.readOperations.getDailyOverview(userInput, query);
  }

  async getDailyDayDetails(userInput: AuthenticatedUser | undefined, query: ListQuery) {
    return this.readOperations.getDailyDayDetails(userInput, query);
  }
}
