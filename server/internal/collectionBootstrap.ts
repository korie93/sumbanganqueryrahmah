import { logger } from "../lib/logger";
import {
  ensureCollectionAdminGroupsTables,
  ensureCollectionAdminVisibleNicknamesTable,
  ensureCollectionNicknameSessionsTable,
  ensureCollectionStaffNicknamesTable,
} from "./collection-bootstrap-access";
import { ensureCollectionDailyTables } from "./collection-bootstrap-daily";
import { ensureCollectionRecordsTables } from "./collection-bootstrap-records";
import { runBootstrapTask, type BootstrapTaskState } from "./collection-bootstrap-task";

export class CollectionBootstrap {
  private readonly recordsState: BootstrapTaskState = { ready: false, initPromise: null };
  private readonly staffNicknamesState: BootstrapTaskState = { ready: false, initPromise: null };
  private readonly adminGroupsState: BootstrapTaskState = { ready: false, initPromise: null };
  private readonly nicknameSessionsState: BootstrapTaskState = { ready: false, initPromise: null };
  private readonly adminVisibleNicknamesState: BootstrapTaskState = { ready: false, initPromise: null };
  private readonly dailyTablesState: BootstrapTaskState = { ready: false, initPromise: null };

  async ensureRecordsTable(): Promise<void> {
    return this.runTask(
      this.recordsState,
      "Failed to ensure collection records table",
      ensureCollectionRecordsTables,
    );
  }

  async ensureStaffNicknamesTable(): Promise<void> {
    return this.runTask(
      this.staffNicknamesState,
      "Failed to ensure collection staff nicknames table",
      ensureCollectionStaffNicknamesTable,
    );
  }

  async ensureAdminGroupsTables(): Promise<void> {
    return this.runTask(
      this.adminGroupsState,
      "Failed to ensure admin group tables",
      ensureCollectionAdminGroupsTables,
    );
  }

  async ensureNicknameSessionsTable(): Promise<void> {
    return this.runTask(
      this.nicknameSessionsState,
      "Failed to ensure collection nickname session table",
      ensureCollectionNicknameSessionsTable,
    );
  }

  async ensureAdminVisibleNicknamesTable(): Promise<void> {
    return this.runTask(
      this.adminVisibleNicknamesState,
      "Failed to ensure admin visible nicknames table",
      ensureCollectionAdminVisibleNicknamesTable,
    );
  }

  async ensureDailyTables(): Promise<void> {
    return this.runTask(
      this.dailyTablesState,
      "Failed to ensure collection daily tables",
      ensureCollectionDailyTables,
    );
  }

  private async runTask(
    state: BootstrapTaskState,
    failureMessage: string,
    task: () => Promise<void>,
  ): Promise<void> {
    try {
      await runBootstrapTask(state, task);
    } catch (err: any) {
      logger.error(failureMessage, { error: err });
      throw err;
    }
  }
}
