import { ensureSettingsSchema } from "./settings-bootstrap-schema";
import { seedEnterpriseSettings } from "./settings-bootstrap-seed-operations";
import type { SettingsBootstrapTaskState } from "./settings-bootstrap-shared";
import { runSettingsBootstrapTask } from "./settings-bootstrap-utils";

export class SettingsBootstrap {
  private readonly state: SettingsBootstrapTaskState = {
    ready: false,
    initPromise: null,
  };

  async ensureTables(): Promise<void> {
    await runSettingsBootstrapTask(
      this.state,
      async (database) => {
        await ensureSettingsSchema(database);
        await seedEnterpriseSettings(database);
      },
      { errorMessage: "Failed to ensure enterprise settings tables" },
    );
  }
}
