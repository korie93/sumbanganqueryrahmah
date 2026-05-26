import { getApiErrorMessage } from "@/lib/api-errors";

export type DashboardQueryErrorInput = {
  label: string;
  error: unknown;
  failed: boolean;
};

export function buildDashboardQueryErrorMessages(
  inputs: readonly DashboardQueryErrorInput[],
): string[] {
  return inputs
    .filter((input) => input.failed)
    .map((input) => {
      const detail = getApiErrorMessage(input.error, "Data gagal dimuat.");
      return `${input.label}: ${detail}`;
    });
}
