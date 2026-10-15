import { useEffect, useState, useTransition } from "react";
import type { UserAccountManagementTabId } from "@/pages/settings/types";

export function useUserAccountManagementSectionState() {
  const [activeTab, setActiveTab] = useState<UserAccountManagementTabId>("managed-account");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeTab]);

  return {
    activeTab,
    isPending,
    mobileNavOpen,
    navCollapsed,
    onSelectTab: (tab: UserAccountManagementTabId) => {
      startTransition(() => {
        setActiveTab(tab);
      });
    },
    setMobileNavOpen,
    setNavCollapsed,
  };
}
