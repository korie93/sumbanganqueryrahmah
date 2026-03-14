import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BarChart3, FolderPlus, ListChecks, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  COLLECTION_STAFF_NICKNAME_KEY,
  getCurrentRole,
  getCurrentUsername,
} from "@/pages/collection/utils";
import { CollectionNicknameDialog } from "@/pages/collection-report/CollectionNicknameDialog";
import { CollectionSidebar } from "@/pages/collection-report/CollectionSidebar";
import type {
  CollectionSidebarItem,
  CollectionSubPage,
} from "@/pages/collection-report/types";
import { useCollectionNicknameAccess } from "@/pages/collection-report/useCollectionNicknameAccess";
import {
  getPathForSubPage,
  getSubPageFromPath,
} from "@/pages/collection-report/utils";

const SaveCollectionPage = lazy(() => import("@/pages/collection/SaveCollectionPage"));
const CollectionRecordsPage = lazy(
  () => import("@/pages/collection/CollectionRecordsPage"),
);
const CollectionSummaryPage = lazy(
  () => import("@/pages/collection/CollectionSummaryPage"),
);
const ManageCollectionNicknamesPage = lazy(
  () => import("@/pages/collection/ManageCollectionNicknamesPage"),
);

function CollectionSectionFallback() {
  return (
    <Card className="border-border/60 bg-background/70">
      <CardContent className="flex min-h-[320px] items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </CardContent>
    </Card>
  );
}

export default function CollectionReport() {
  const role = useMemo(() => getCurrentRole(), []);
  const currentUsername = useMemo(() => getCurrentUsername(), []);
  const isSuperuser = role === "superuser";
  const requiresNicknamePassword = role === "admin" || role === "user";

  const [subPage, setSubPage] = useState<CollectionSubPage>(() => {
    if (typeof window === "undefined") return "save";
    return getSubPageFromPath(window.location.pathname || "/collection/save");
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const nicknameAccess = useCollectionNicknameAccess({
    currentUsername,
    isSuperuser,
    requiresNicknamePassword,
    role,
  });

  const sidebarItems = useMemo<CollectionSidebarItem[]>(() => {
    const items: CollectionSidebarItem[] = [
      { key: "save", label: "Simpan Collection Individual", icon: FolderPlus },
      { key: "records", label: "View Rekod Collection", icon: ListChecks },
      { key: "summary", label: "Collection Summary", icon: BarChart3 },
    ];
    if (isSuperuser) {
      items.push({
        key: "manage-nicknames",
        label: "Manage Nickname",
        icon: Settings2,
      });
    }
    return items;
  }, [isSuperuser]);

  const activeSidebarItem = useMemo(
    () => sidebarItems.find((item) => item.key === subPage) || sidebarItems[0],
    [sidebarItems, subPage],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (subPage === "manage-nicknames" && !isSuperuser) {
      setSubPage("save");
      return;
    }

    const targetPath = getPathForSubPage(subPage);
    if (window.location.pathname.toLowerCase() !== targetPath.toLowerCase()) {
      window.history.replaceState({}, "", targetPath);
    }
  }, [isSuperuser, subPage]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [subPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPopState = () => {
      setSubPage(getSubPageFromPath(window.location.pathname || "/collection/save"));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const redirectToSearchTab = useCallback(() => {
    nicknameAccess.clearNicknameSession();
    localStorage.setItem("activeTab", "general-search");
    localStorage.setItem("lastPage", "general-search");
    if (typeof window !== "undefined") {
      window.location.assign("/");
    }
  }, [nicknameAccess]);

  const handleDialogOpenChange = (open: boolean) => {
    if (open) {
      nicknameAccess.setNicknameDialogOpen(true);
      return;
    }
    if (!isSuperuser && !nicknameAccess.canAccessCollection) {
      redirectToSearchTab();
      return;
    }
    nicknameAccess.setNicknameDialogOpen(false);
  };

  const handleSelectSubPage = useCallback((nextSubPage: CollectionSubPage) => {
    startTransition(() => {
      setSubPage(nextSubPage);
    });
    setMobileSidebarOpen(false);
  }, []);

  const renderContent = () => {
    if (!nicknameAccess.canAccessCollection) {
      return (
        <Card className="border-border/60 bg-background/75 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Pengesahan Nickname Diperlukan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sila lengkapkan pengesahan nickname dahulu sebelum meneruskan ke
              Collection Report.
            </p>
            <Button onClick={() => nicknameAccess.setNicknameDialogOpen(true)}>
              Buka Pengesahan Nickname
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (subPage === "save") {
      return (
        <Suspense fallback={<CollectionSectionFallback />}>
          <SaveCollectionPage staffNickname={nicknameAccess.staffNickname} />
        </Suspense>
      );
    }
    if (subPage === "records") {
      return (
        <Suspense fallback={<CollectionSectionFallback />}>
          <CollectionRecordsPage role={role} />
        </Suspense>
      );
    }
    if (subPage === "summary") {
      return (
        <Suspense fallback={<CollectionSectionFallback />}>
          <CollectionSummaryPage role={role} />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<CollectionSectionFallback />}>
        <ManageCollectionNicknamesPage
          role={role}
          currentNickname={nicknameAccess.staffNickname}
        />
      </Suspense>
    );
  };

  const primaryActionLabel =
    nicknameAccess.dialogStep === "setup"
      ? "Save Password"
      : nicknameAccess.dialogStep === "login"
        ? "Login Nickname"
        : "Continue";
  const primaryLoadingLabel =
    nicknameAccess.dialogStep === "setup"
      ? "Saving..."
      : nicknameAccess.dialogStep === "login"
        ? "Signing In..."
        : "Checking...";

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background px-4 py-4 lg:px-6">
      <div className="mx-auto max-w-[1680px] space-y-4">
        <Card className="border-border/60 bg-background/75 shadow-sm">
          <CardHeader className="py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl leading-tight">
                  Collection Report
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Staff Nickname:{" "}
                  <span className="font-medium">
                    {nicknameAccess.staffNickname || "-"}
                  </span>
                  {activeSidebarItem ? (
                    <span>
                      {" | "}Section:{" "}
                      <span className="font-medium">{activeSidebarItem.label}</span>
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="relative flex items-start gap-4">
          <CollectionSidebar
            items={sidebarItems}
            mobileOpen={mobileSidebarOpen}
            onMobileOpenChange={setMobileSidebarOpen}
            onSelectSubPage={handleSelectSubPage}
            onSidebarCollapsedChange={setSidebarCollapsed}
            selectedSubPage={subPage}
            sidebarCollapsed={sidebarCollapsed}
          />

          <div className="min-w-0 flex-1">{renderContent()}</div>
        </div>
      </div>

      <CollectionNicknameDialog
        confirmNicknamePassword={nicknameAccess.confirmNicknamePassword}
        dialogStep={nicknameAccess.dialogStep}
        nicknameDialogOpen={nicknameAccess.nicknameDialogOpen}
        nicknameInput={nicknameAccess.nicknameInput}
        nicknamePassword={nicknameAccess.nicknamePassword}
        onConfirmNicknamePasswordChange={nicknameAccess.setConfirmNicknamePassword}
        onDialogOpenChange={handleDialogOpenChange}
        onNicknameInputChange={nicknameAccess.setNicknameInput}
        onNicknamePasswordChange={nicknameAccess.setNicknamePassword}
        onPrimaryAction={() => {
          if (nicknameAccess.dialogStep === "setup") {
            void nicknameAccess.handleSetupNicknamePassword();
            return;
          }
          if (nicknameAccess.dialogStep === "login") {
            void nicknameAccess.handleNicknameLogin();
            return;
          }
          void nicknameAccess.handleCheckNickname();
        }}
        onResetTemporaryValues={() => {
          nicknameAccess.setNicknamePassword("");
          nicknameAccess.setConfirmNicknamePassword("");
          nicknameAccess.setResolvedNickname(
            String(sessionStorage.getItem(COLLECTION_STAFF_NICKNAME_KEY) || "").trim(),
          );
          nicknameAccess.setShowLoginPassword(false);
          nicknameAccess.setShowSetupPassword(false);
          nicknameAccess.setShowSetupConfirmPassword(false);
        }}
        onReturnToSearch={redirectToSearchTab}
        onStepChange={nicknameAccess.setDialogStep}
        onToggleLoginPassword={() =>
          nicknameAccess.setShowLoginPassword(!nicknameAccess.showLoginPassword)
        }
        onToggleSetupConfirmPassword={() =>
          nicknameAccess.setShowSetupConfirmPassword(
            !nicknameAccess.showSetupConfirmPassword,
          )
        }
        onToggleSetupPassword={() =>
          nicknameAccess.setShowSetupPassword(!nicknameAccess.showSetupPassword)
        }
        primaryLabel={primaryActionLabel}
        primaryLoadingLabel={primaryLoadingLabel}
        resolvedNickname={nicknameAccess.resolvedNickname}
        setSetupModeFirstTime={() => nicknameAccess.setSetupMode("first-time")}
        setupMode={nicknameAccess.setupMode}
        showLoginPassword={nicknameAccess.showLoginPassword}
        showSetupConfirmPassword={nicknameAccess.showSetupConfirmPassword}
        showSetupPassword={nicknameAccess.showSetupPassword}
        submittingNicknameAuth={nicknameAccess.submittingNicknameAuth}
      />
    </div>
  );
}
