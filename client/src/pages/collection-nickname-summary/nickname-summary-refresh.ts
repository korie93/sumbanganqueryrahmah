import { isValidDate } from "@/pages/collection/utils";

type CollectionNicknameSummaryRefreshSelection = {
  canAccess: boolean;
  hasApplied: boolean;
  loadingSummary: boolean;
  appliedNicknames: string[];
  appliedFromDate: string;
  appliedToDate: string;
};

export function getCollectionNicknameSummaryRefreshScope(selection: CollectionNicknameSummaryRefreshSelection) {
  if (!selection.canAccess || !selection.hasApplied || selection.loadingSummary) return null;
  const from = selection.appliedFromDate;
  const to = selection.appliedToDate;
  if (!isValidDate(from) || !isValidDate(to) || from > to) return null;
  const nicknames = selection.appliedNicknames.map((nickname) => nickname.trim()).filter(Boolean);
  if (nicknames.length === 0) return null;
  return { from, to, nicknames };
}
