import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  buildMutationErrorToast,
  buildMutationSuccessToast,
} from "@/lib/mutation-feedback";

export function useMutationFeedback() {
  const { toast } = useToast();

  const notifyMutationSuccess = useCallback((input: {
    title: string;
    description: string;
    duration?: number;
  }) => {
    toast(buildMutationSuccessToast(input));
  }, [toast]);

  const notifyMutationError = useCallback((input: {
    title: string;
    description?: string;
    error?: unknown;
    fallbackDescription?: string;
    duration?: number;
  }) => {
    toast(buildMutationErrorToast(input));
  }, [toast]);

  return {
    notifyMutationSuccess,
    notifyMutationError,
  };
}
