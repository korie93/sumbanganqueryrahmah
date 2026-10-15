// The existing client runner discovers .test.ts files, not .test.tsx. Keep the
// presentation regressions for this Collection pass in CI without changing
// discovery for unrelated legacy tests. Browser tests verify the real CSS.
await import(new URL("../../../../../scripts/lib/register-client-css-test-loader.mjs", import.meta.url).href);

await import("../../collection-records/CollectionRecordsFilters.test");
await import("../../collection-summary/CollectionMonthlyComparisonPanel.test");
await import("../../collection-summary/CollectionSummaryPresentation.test");
await import("../CollectionDailyCalendarLayout.test");
await import("../CollectionDailyCalendarViewModeControl.test");
await import("../CollectionNicknameSummaryFilterStatus.test");
await import("./save-collection-presentation.test");

export {};
