type XlsxModule = typeof import("xlsx");

export type ClientSpreadsheetRuntime = {
  implementation: "xlsx";
  migrationStrategy: string;
  module: XlsxModule;
};

let clientSpreadsheetRuntimePromise: Promise<ClientSpreadsheetRuntime> | null = null;

export function loadClientSpreadsheetRuntime(): Promise<ClientSpreadsheetRuntime> {
  if (!clientSpreadsheetRuntimePromise) {
    clientSpreadsheetRuntimePromise = import("xlsx").then((module) => ({
      implementation: "xlsx" as const,
      migrationStrategy:
        "Route all browser spreadsheet reads and writes through this loader so the app can adopt an ExcelJS-compatible adapter later without changing every import/export surface.",
      module,
    }));
  }

  return clientSpreadsheetRuntimePromise;
}
