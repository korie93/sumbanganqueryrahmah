import {
  ensureAiCategoryRulesSchema,
  ensureAiCategoryStatsSchema,
  ensureAiCoreTables,
} from "./ai-bootstrap-schema";
import {
  createBootstrapTaskState,
  runAiBootstrapTask,
  type BootstrapTaskState,
} from "./ai-bootstrap-utils";

export class AiBootstrap {
  private readonly aiState: BootstrapTaskState = createBootstrapTaskState();
  private readonly categoryStatsState: BootstrapTaskState = createBootstrapTaskState();
  private readonly categoryRulesState: BootstrapTaskState = createBootstrapTaskState();

  async ensureAiTables(): Promise<void> {
    await runAiBootstrapTask(this.aiState, "Failed to ensure AI tables", ensureAiCoreTables);
  }

  async ensureCategoryStatsTable(): Promise<void> {
    await runAiBootstrapTask(
      this.categoryStatsState,
      "Failed to ensure AI category stats table",
      ensureAiCategoryStatsSchema,
    );
  }

  async ensureCategoryRulesTable(): Promise<void> {
    await runAiBootstrapTask(
      this.categoryRulesState,
      "Failed to ensure AI category rules table",
      ensureAiCategoryRulesSchema,
    );
  }
}
