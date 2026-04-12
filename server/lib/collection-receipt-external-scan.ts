import { createFallbackExternalScanConfig, readExternalScanConfig } from "./collection-receipt-external-scan-config";
import { validateExternalScanCommand, validateExternalScanFilePath } from "./collection-receipt-external-scan-paths";
import { createOperationalScanError, runExternalReceiptScan } from "./collection-receipt-external-scan-runner";
import { buildScanArgs } from "./collection-receipt-external-scan-shared";

export async function scanCollectionReceiptWithExternalScanner(filePath: string): Promise<void> {
  let config;
  try {
    config = readExternalScanConfig();
  } catch (error) {
    const operational = createOperationalScanError(
      createFallbackExternalScanConfig(),
      filePath,
      "external-scan-config-invalid",
      error instanceof Error ? error.message : "invalid scanner configuration",
    );
    if (operational) {
      throw operational;
    }
    return;
  }
  if (!config.enabled) {
    return;
  }

  if (!config.command) {
    const error = createOperationalScanError(config, filePath, "external-scan-command-missing");
    if (error) {
      throw error;
    }
    return;
  }

  let scannerCommand: string;
  try {
    scannerCommand = await validateExternalScanCommand(config.command);
  } catch (error) {
    const operational = createOperationalScanError(
      config,
      filePath,
      "external-scan-command-invalid",
      error instanceof Error ? error.message : "invalid scanner command",
    );
    if (operational) {
      throw operational;
    }
    return;
  }

  let validatedFilePath: string;
  try {
    validatedFilePath = await validateExternalScanFilePath(filePath);
  } catch (error) {
    const operational = createOperationalScanError(
      config,
      filePath,
      "external-scan-file-invalid",
      error instanceof Error ? error.message : "invalid scanner file path",
    );
    if (operational) {
      throw operational;
    }
    return;
  }

  const args = buildScanArgs(config, validatedFilePath);
  await runExternalReceiptScan({
    config,
    filePath,
    scannerCommand,
    args,
  });
}
