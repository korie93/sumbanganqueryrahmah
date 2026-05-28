import { getApiErrorMessage } from "@/lib/api-errors";

export type DashboardQueryErrorInput = {
  label: string;
  error: unknown;
  failed: boolean;
};

export function getDashboardQueryErrorDetail(error: unknown) {
  return getApiErrorMessage(error, "Data gagal dimuat.");
}

export function buildDashboardQueryErrorMessage(input: DashboardQueryErrorInput): string | null {
  if (!input.failed) {
    return null;
  }

  return `${input.label}: ${getDashboardQueryErrorDetail(input.error)}`;
}

export function buildDashboardQueryErrorMessages(
  inputs: readonly DashboardQueryErrorInput[],
): string[] {
  return inputs
    .map(buildDashboardQueryErrorMessage)
    .filter((message): message is string => message !== null);
}
