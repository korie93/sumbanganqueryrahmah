import { useEffect, type Dispatch, type SetStateAction } from "react";
import { getDefaultPageForRole } from "@/app/monitorAccess";
import { buildPathForPage, replaceHistory } from "@/app/routing";
import type { TabVisibility, User } from "@/app/types";

type UseAppShellPageSyncArgs = {
  currentPage: string;
  setCurrentPage: Dispatch<SetStateAction<string>>;
  tabVisibility: TabVisibility;
  tabVisibilityLoaded: boolean;
  user: User | null;
};

export function useAppShellPageSync({
  currentPage,
  setCurrentPage,
  tabVisibility,
  tabVisibilityLoaded,
  user,
}: UseAppShellPageSyncArgs) {
  useEffect(() => {
    if (!user || user.mustChangePassword || currentPage !== "change-password") return;

    const nextPage = getDefaultPageForRole(user.role, tabVisibility, tabVisibilityLoaded);
    setCurrentPage(nextPage);
    replaceHistory(buildPathForPage(nextPage));
  }, [currentPage, setCurrentPage, tabVisibility, tabVisibilityLoaded, user]);

  useEffect(() => {
    if (!user) return;
    const pathname = typeof window !== "undefined" ? window.location.pathname.toLowerCase() : "/";
    if (
      pathname !== "/forgot-password"
      && pathname !== "/activate-account"
      && pathname !== "/reset-password"
    ) {
      return;
    }

    const nextPage = user.mustChangePassword
      ? "change-password"
      : getDefaultPageForRole(user.role, tabVisibility, tabVisibilityLoaded);
    setCurrentPage(nextPage);
    replaceHistory(buildPathForPage(nextPage));
  }, [setCurrentPage, tabVisibility, tabVisibilityLoaded, user]);
}
