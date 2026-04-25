import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { User } from "@/app/types";
import { getImports } from "@/lib/api";

type UseAppShellSavedCountArgs = {
  currentPage: string;
  setSavedCount: Dispatch<SetStateAction<number>>;
  user: User | null;
};

export function useAppShellSavedCount({
  currentPage,
  setSavedCount,
  user,
}: UseAppShellSavedCountArgs) {
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const syncSavedCount = async () => {
      if (!user || user.role === "user") {
        if (!cancelled) {
          setSavedCount(0);
        }
        return;
      }

      if (currentPage === "saved") {
        return;
      }

      try {
        const data = await getImports({ limit: 1, signal: controller.signal });
        if (!cancelled) {
          setSavedCount(
            typeof data?.pagination?.total === "number"
              ? data.pagination.total
              : (data.imports?.length || 0),
          );
        }
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        if (!cancelled) {
          setSavedCount(0);
        }
      }
    };

    void syncSavedCount();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentPage, setSavedCount, user]);
}
