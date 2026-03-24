import { parseCollectionApiErrorDetails } from "@/pages/collection/utils";

export type MutationToastPayload = {
  title: string;
  description: string;
  variant?: "default" | "destructive";
  duration?: number;
};

type BuildMutationSuccessToastInput = {
  title: string;
  description: string;
  duration?: number;
};

type BuildMutationErrorToastInput = {
  title: string;
  description?: string;
  error?: unknown;
  fallbackDescription?: string;
  duration?: number;
};

export function resolveMutationErrorMessage(
  error: unknown,
  fallbackDescription = "Request failed. Please try again.",
): string {
  const parsedMessage = parseCollectionApiErrorDetails(error).message.trim();
  return parsedMessage || fallbackDescription;
}

export function buildMutationSuccessToast(
  input: BuildMutationSuccessToastInput,
): MutationToastPayload {
  return {
    title: input.title,
    description: input.description,
    variant: "default",
    ...(typeof input.duration === "number" ? { duration: input.duration } : {}),
  };
}

export function buildMutationErrorToast(
  input: BuildMutationErrorToastInput,
): MutationToastPayload {
  return {
    title: input.title,
    description:
      String(input.description || "").trim()
      || resolveMutationErrorMessage(input.error, input.fallbackDescription),
    variant: "destructive",
    ...(typeof input.duration === "number" ? { duration: input.duration } : {}),
  };
}
