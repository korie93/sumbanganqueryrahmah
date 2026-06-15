import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";

export function countCollectionNicknameSummaryControls(params: {
  selectedNicknames: string[];
  fromDate: string;
  toDate: string;
}): number {
  return (
    (params.selectedNicknames.length > 0 ? 1 : 0) +
    (params.fromDate ? 1 : 0) +
    (params.toDate ? 1 : 0)
  );
}

export function formatCollectionNicknameSummaryMobileDateRange(fromDate: string, toDate: string): string {
  if (fromDate && toDate) {
    return `${formatIsoDateToDDMMYYYY(fromDate)} - ${formatIsoDateToDDMMYYYY(toDate)}`;
  }
  if (fromDate) {
    return `From ${formatIsoDateToDDMMYYYY(fromDate)}`;
  }
  if (toDate) {
    return `To ${formatIsoDateToDDMMYYYY(toDate)}`;
  }
  return "Choose a date range before applying the nickname summary.";
}

export function getCollectionNicknameSummaryPreview(selectedNicknames: string[]): {
  selectedNicknamePreview: string[];
  remainingNicknameCount: number;
} {
  const selectedNicknamePreview = selectedNicknames.slice(0, 2);
  return {
    selectedNicknamePreview,
    remainingNicknameCount: selectedNicknames.length - selectedNicknamePreview.length,
  };
}

export function buildCollectionNicknameSummaryChartResetKey(params: {
  selectedNicknames: string[];
  fromDate: string;
  toDate: string;
}): string {
  const nicknames = Array.from(
    new Set(
      params.selectedNicknames
        .map((nickname) => String(nickname || "").trim().toLocaleLowerCase("en-MY"))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, "en-MY"));

  return JSON.stringify({
    fromDate: String(params.fromDate || "").trim(),
    toDate: String(params.toDate || "").trim(),
    nicknames,
  });
}
