export function buildGeneralSearchAdvancedStatusText(
  activeFiltersCount: number,
  logic: "AND" | "OR",
) {
  if (activeFiltersCount > 0) {
    return `${activeFiltersCount} filter${activeFiltersCount === 1 ? "" : "s"} configured with ${logic} logic.`;
  }

  return "Open the filter sheet to choose fields, operators, and values.";
}

export function buildGeneralSearchMobileSheetDescription(advancedMode: boolean) {
  return advancedMode
    ? "Adjust field rules here, then search with the current logic."
    : "Prefer a quick keyword search? Use the compact query field below.";
}
