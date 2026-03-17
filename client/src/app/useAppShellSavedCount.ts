import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { User } from "@/app/types";
import { getImports } from "@/lib/api";

type UseAppShellSavedCountArgs = {
  setSavedCount: Dispatch<SetStateAction<number>>;
  user: User | null;
};

export function useAppShellSavedCount({
  setSavedCount,
  user,
}: UseAppShellSavedCountArgs) {
  useEffect(() => {
    let cancelled = false;

    const syncSavedCount = async () => {
      if (!user || user.role === "user") {
        if (!cancelled) {
          setSavedCount(0);
        }
        return;
      }

      try {
        const data = await getImports();
        if (!cancelled) {
          setSavedCount(data.imports?.length || 0);
        }
      } catch {
        if (!cancelled) {
          setSavedCount(0);
        }
      }
    };

    void syncSavedCount();
    return () => {
      cancelled = true;
    };
  }, [setSavedCount, user]);
}
