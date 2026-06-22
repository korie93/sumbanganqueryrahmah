import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function readCollectionSource(fileName: string): string {
  return readFileSync(path.resolve(process.cwd(), "client/src/pages/collection", fileName), "utf8");
}

const nicknameSummaryMobileFiltersSource = readCollectionSource("CollectionNicknameSummaryMobileFilters.tsx");
const summaryPageSource = readCollectionSource("CollectionSummaryPage.tsx");
const recordsPageSource = readCollectionSource("CollectionRecordsPage.tsx");
const dailyFiltersCardSource = readCollectionSource("CollectionDailyFiltersCard.tsx");
const dailyDayDetailsDialogSource = readCollectionSource("CollectionDailyDayDetailsDialog.tsx");
const dailyDayDetailsDialogPartsSource = readCollectionSource("CollectionDailyDayDetailsDialogParts.tsx");
const dailyConflictReportSource = readCollectionSource("CollectionDailyCalendarConflictReport.tsx");
const dailyAttentionSummarySource = readCollectionSource("CollectionDailyCalendarAttentionSummary.tsx");
const dailyDayDetailsEmptyStateSource = readCollectionSource("CollectionDailyDayDetailsEmptyState.tsx");
const dailyRoleGuideSource = readCollectionSource("CollectionDailyRoleGuide.tsx");
const dailyDayStatusNoticeSource = readCollectionSource("CollectionDailyDayStatusNotice.tsx");
const manageNicknamesSource = readCollectionSource("ManageCollectionNicknamesPage.tsx");

test("collection mobile filter action icons are decorative only", () => {
  assert.match(nicknameSummaryMobileFiltersSource, /<Filter className="mr-2 h-4 w-4" aria-hidden="true" \/>/);
  assert.match(nicknameSummaryMobileFiltersSource, /<RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" \/>/);
  assert.match(summaryPageSource, /<Filter className="mr-2 h-4 w-4" aria-hidden="true" \/>/);
  assert.match(summaryPageSource, /<RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" \/>/);
  assert.match(recordsPageSource, /<Filter className="mr-2 h-4 w-4" aria-hidden="true" \/>/);
  assert.match(recordsPageSource, /<RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" \/>/);
});

test("collection daily heading and loading icons are hidden from assistive technology", () => {
  assert.match(dailyFiltersCardSource, /<CalendarDays className="collection-daily-title-icon h-5 w-5" aria-hidden="true" \/>/);
  assert.match(dailyFiltersCardSource, /<Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" \/>/);
  assert.match(dailyDayDetailsDialogSource, /<Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" \/>/);
  assert.match(dailyDayDetailsDialogPartsSource, /<Loader2 className="h-3\.5 w-3\.5 animate-spin" aria-hidden="true" \/>/);
  assert.match(dailyDayDetailsDialogPartsSource, /<Eye className="h-3\.5 w-3\.5" aria-hidden="true" \/>/);
  assert.match(dailyConflictReportSource, /<AlertTriangle className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(summaryPageSource, /<CalendarRange className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(dailyAttentionSummarySource, /<Icon className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(dailyDayDetailsEmptyStateSource, /<CalendarOff className="h-5 w-5" aria-hidden="true" \/>/);
  assert.match(dailyRoleGuideSource, /<Icon className="h-5 w-5" aria-hidden="true" \/>/);
  assert.match(dailyDayStatusNoticeSource, /<CalendarOff className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(dailyDayStatusNoticeSource, /<BriefcaseBusiness className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(manageNicknamesSource, /<ShieldCheck className="mr-1 h-3\.5 w-3\.5" aria-hidden="true" \/>/);
});
