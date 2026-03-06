import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Eye, EyeOff, FolderPlus, ListChecks, Menu, PanelLeftClose, PanelLeftOpen, Settings2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  checkCollectionNicknameAuth,
  loginCollectionNickname,
  setupCollectionNicknamePassword,
} from "@/lib/api";
import CollectionRecordsPage from "@/pages/collection/CollectionRecordsPage";
import CollectionSummaryPage from "@/pages/collection/CollectionSummaryPage";
import ManageCollectionNicknamesPage from "@/pages/collection/ManageCollectionNicknamesPage";
import SaveCollectionPage from "@/pages/collection/SaveCollectionPage";
import {
  COLLECTION_STAFF_NICKNAME_AUTH_KEY,
  COLLECTION_STAFF_NICKNAME_KEY,
  getCurrentRole,
  getCurrentUsername,
  parseApiError,
} from "@/pages/collection/utils";

type CollectionSubPage = "save" | "records" | "summary" | "manage-nicknames";
type NicknameDialogStep = "nickname" | "setup" | "login";
type CollectionSidebarItem = {
  key: CollectionSubPage;
  label: string;
  icon: typeof FolderPlus;
};

function hasLetterAndNumber(value: string): boolean {
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}

function getSubPageFromPath(pathname: string): CollectionSubPage {
  const normalized = pathname.toLowerCase();
  if (normalized.startsWith("/collection/nicknames")) return "manage-nicknames";
  if (normalized.startsWith("/collection/summary")) return "summary";
  if (normalized.startsWith("/collection/records")) return "records";
  return "save";
}

function getPathForSubPage(subPage: CollectionSubPage): string {
  if (subPage === "manage-nicknames") return "/collection/nicknames";
  if (subPage === "summary") return "/collection/summary";
  return subPage === "records" ? "/collection/records" : "/collection/save";
}

function isValidNicknameAuthSession(raw: string, username: string, role: string, nickname: string): boolean {
  try {
    const parsed = JSON.parse(raw || "{}");
    const savedNickname = String(parsed?.nickname || "").trim().toLowerCase();
    const savedUsername = String(parsed?.username || "").trim().toLowerCase();
    const savedRole = String(parsed?.role || "").trim().toLowerCase();
    if (!savedNickname || !savedUsername || !savedRole) return false;
    if (!username || !nickname) return false;
    return savedNickname === nickname.toLowerCase() && savedUsername === username && savedRole === role;
  } catch {
    return false;
  }
}

export default function CollectionReport() {
  const { toast } = useToast();
  const role = useMemo(() => getCurrentRole(), []);
  const currentUsername = useMemo(() => getCurrentUsername(), []);
  const isSuperuser = role === "superuser";
  const requiresNicknamePassword = role === "admin" || role === "user";

  const [subPage, setSubPage] = useState<CollectionSubPage>(() => {
    if (typeof window === "undefined") return "save";
    return getSubPageFromPath(window.location.pathname || "/collection/save");
  });

  const [staffNickname, setStaffNickname] = useState(() => {
    if (typeof window === "undefined") return "";
    return String(sessionStorage.getItem(COLLECTION_STAFF_NICKNAME_KEY) || "").trim();
  });
  const [nicknameSessionVerified, setNicknameSessionVerified] = useState(() => {
    if (typeof window === "undefined") return false;
    const nickname = String(sessionStorage.getItem(COLLECTION_STAFF_NICKNAME_KEY) || "").trim();
    const authRaw = String(sessionStorage.getItem(COLLECTION_STAFF_NICKNAME_AUTH_KEY) || "");
    return isValidNicknameAuthSession(authRaw, currentUsername, role, nickname);
  });

  const [nicknameDialogOpen, setNicknameDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<NicknameDialogStep>("nickname");
  const [nicknameInput, setNicknameInput] = useState(staffNickname);
  const [resolvedNickname, setResolvedNickname] = useState(staffNickname);
  const [nicknamePassword, setNicknamePassword] = useState("");
  const [confirmNicknamePassword, setConfirmNicknamePassword] = useState("");
  const [setupMode, setSetupMode] = useState<"first-time" | "forced-change">("first-time");
  const [verifiedNicknamePassword, setVerifiedNicknamePassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [showSetupConfirmPassword, setShowSetupConfirmPassword] = useState(false);
  const [submittingNicknameAuth, setSubmittingNicknameAuth] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const canAccessCollection = isSuperuser
    ? true
    : Boolean(staffNickname && nicknameSessionVerified);

  const sidebarItems = useMemo<CollectionSidebarItem[]>(() => {
    const items: CollectionSidebarItem[] = [
      { key: "save", label: "Simpan Collection Individual", icon: FolderPlus },
      { key: "records", label: "View Rekod Collection", icon: ListChecks },
      { key: "summary", label: "Collection Summary", icon: BarChart3 },
    ];
    if (isSuperuser) {
      items.push({ key: "manage-nicknames", label: "Manage Nickname", icon: Settings2 });
    }
    return items;
  }, [isSuperuser]);

  const activeSidebarItem = useMemo(
    () => sidebarItems.find((item) => item.key === subPage) || sidebarItems[0],
    [sidebarItems, subPage],
  );

  const clearNicknameSession = useCallback(() => {
    sessionStorage.removeItem(COLLECTION_STAFF_NICKNAME_KEY);
    sessionStorage.removeItem(COLLECTION_STAFF_NICKNAME_AUTH_KEY);
    setStaffNickname("");
    setNicknameSessionVerified(false);
    setVerifiedNicknamePassword("");
    setSetupMode("first-time");
    setShowLoginPassword(false);
    setShowSetupPassword(false);
    setShowSetupConfirmPassword(false);
  }, []);

  const applyNicknameSession = useCallback((nickname: string) => {
    const normalized = String(nickname || "").trim();
    if (!normalized) return;
    sessionStorage.setItem(COLLECTION_STAFF_NICKNAME_KEY, normalized);
    sessionStorage.setItem(
      COLLECTION_STAFF_NICKNAME_AUTH_KEY,
      JSON.stringify({
        nickname: normalized,
        username: currentUsername,
        role,
        verifiedAt: Date.now(),
      }),
    );
    setStaffNickname(normalized);
    setNicknameSessionVerified(true);
    setNicknameDialogOpen(false);
    setVerifiedNicknamePassword("");
    setSetupMode("first-time");
    setShowLoginPassword(false);
    setShowSetupPassword(false);
    setShowSetupConfirmPassword(false);
  }, [currentUsername, role]);

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

  useEffect(() => {
    if (isSuperuser || !requiresNicknamePassword) return;
    if (!nicknameSessionVerified) {
      setDialogStep("nickname");
      setNicknameInput(staffNickname);
      setResolvedNickname(staffNickname);
      setNicknamePassword("");
      setConfirmNicknamePassword("");
      setVerifiedNicknamePassword("");
      setSetupMode("first-time");
      setShowLoginPassword(false);
      setShowSetupPassword(false);
      setShowSetupConfirmPassword(false);
      setNicknameDialogOpen(true);
    }
  }, [isSuperuser, nicknameSessionVerified, requiresNicknamePassword, staffNickname]);

  const handleCheckNickname = async () => {
    const normalized = String(nicknameInput || "").trim();
    if (normalized.length < 2) {
      toast({
        title: "Validation Error",
        description: "Sila masukkan nickname yang sah.",
        variant: "destructive",
      });
      return;
    }

    setSubmittingNicknameAuth(true);
    try {
      const response = await checkCollectionNicknameAuth(normalized);
      const nextNickname = String(response?.nickname?.nickname || normalized).trim();
      setResolvedNickname(nextNickname);
      setNicknameInput(nextNickname);
      setNicknamePassword("");
      setConfirmNicknamePassword("");
      setVerifiedNicknamePassword("");
      setShowLoginPassword(false);
      setShowSetupPassword(false);
      setShowSetupConfirmPassword(false);
      if (response?.nickname?.requiresPasswordSetup) {
        setSetupMode("first-time");
        setDialogStep("setup");
      } else {
        setDialogStep("login");
      }
    } catch (error: unknown) {
      const errorMessage = parseApiError(error);
      toast({
        title: "Nickname Tidak Sah",
        description: errorMessage
          ? `${errorMessage}. Jika nickname salah atau terlupa, sila contact superuser.`
          : "Nickname tidak sah. Jika nickname salah atau terlupa, sila contact superuser.",
        variant: "destructive",
      });
    } finally {
      setSubmittingNicknameAuth(false);
    }
  };

  const handleSetupNicknamePassword = async () => {
    const nickname = String(resolvedNickname || nicknameInput || "").trim();
    if (!nickname) return;
    if (nicknamePassword.length < 8) {
      toast({
        title: "Validation Error",
        description: "Password mesti sekurang-kurangnya 8 aksara.",
        variant: "destructive",
      });
      return;
    }
    if (!hasLetterAndNumber(nicknamePassword)) {
      toast({
        title: "Validation Error",
        description: "Password mesti mengandungi sekurang-kurangnya satu huruf dan satu nombor.",
        variant: "destructive",
      });
      return;
    }
    if (nicknamePassword !== confirmNicknamePassword) {
      toast({
        title: "Validation Error",
        description: "Password dan confirm password tidak sepadan.",
        variant: "destructive",
      });
      return;
    }
    if (setupMode === "forced-change") {
      if (!verifiedNicknamePassword) {
        toast({
          title: "Sesi Tamat",
          description: "Sila login semula dengan password sementara sebelum tukar password baharu.",
          variant: "destructive",
        });
        setDialogStep("login");
        return;
      }
      if (nicknamePassword === verifiedNicknamePassword) {
        toast({
          title: "Validation Error",
          description: "Password baharu mesti berbeza daripada password sementara.",
          variant: "destructive",
        });
        return;
      }
    }

    setSubmittingNicknameAuth(true);
    try {
      const response = await setupCollectionNicknamePassword({
        nickname,
        currentPassword: setupMode === "forced-change" ? verifiedNicknamePassword : undefined,
        newPassword: nicknamePassword,
        confirmPassword: confirmNicknamePassword,
      });
      const activeNickname = String(response?.nickname?.nickname || nickname).trim();
      applyNicknameSession(activeNickname);
      setDialogStep("nickname");
      setNicknamePassword("");
      setConfirmNicknamePassword("");
      setVerifiedNicknamePassword("");
      setSetupMode("first-time");
      setShowSetupPassword(false);
      setShowSetupConfirmPassword(false);
      toast({
        title: "Password Nickname Disimpan",
        description: "Password baharu berjaya disimpan. Anda kini boleh gunakan Collection Report.",
      });
    } catch (error: unknown) {
      toast({
        title: "Gagal Simpan Password",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setSubmittingNicknameAuth(false);
    }
  };

  const handleNicknameLogin = async () => {
    const nickname = String(resolvedNickname || nicknameInput || "").trim();
    if (!nickname) return;
    if (!nicknamePassword) {
      toast({
        title: "Validation Error",
        description: "Sila masukkan password nickname.",
        variant: "destructive",
      });
      return;
    }

    setSubmittingNicknameAuth(true);
    try {
      const response = await loginCollectionNickname({
        nickname,
        password: nicknamePassword,
      });
      if (response?.nickname?.requiresForcedPasswordChange) {
        setSetupMode("forced-change");
        setVerifiedNicknamePassword(nicknamePassword);
        setDialogStep("setup");
        setNicknamePassword("");
        setConfirmNicknamePassword("");
        setShowLoginPassword(false);
        setShowSetupPassword(false);
        setShowSetupConfirmPassword(false);
        toast({
          title: "Tukar Password Diperlukan",
          description: "Sila tetapkan kata laluan baharu sebelum meneruskan.",
          variant: "destructive",
        });
        return;
      }

      const activeNickname = String(response?.nickname?.nickname || nickname).trim();
      applyNicknameSession(activeNickname);
      setDialogStep("nickname");
      setNicknamePassword("");
      setConfirmNicknamePassword("");
      setVerifiedNicknamePassword("");
      setSetupMode("first-time");
      setShowLoginPassword(false);
      toast({
        title: "Nickname Login Berjaya",
        description: `Nama staff collection: ${activeNickname}`,
      });
    } catch (error: unknown) {
      toast({
        title: "Password Tidak Sah",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setSubmittingNicknameAuth(false);
    }
  };

  const redirectToSearchTab = useCallback(() => {
    clearNicknameSession();
    localStorage.setItem("activeTab", "general-search");
    localStorage.setItem("lastPage", "general-search");
    if (typeof window !== "undefined") {
      window.location.assign("/");
    }
  }, [clearNicknameSession]);

  const handleDialogOpenChange = (open: boolean) => {
    if (open) {
      setNicknameDialogOpen(true);
      return;
    }
    if (!isSuperuser && !canAccessCollection) {
      redirectToSearchTab();
      return;
    }
    setNicknameDialogOpen(false);
  };

  const handleSelectSubPage = useCallback((nextSubPage: CollectionSubPage) => {
    setSubPage(nextSubPage);
    setMobileSidebarOpen(false);
  }, []);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background px-4 py-4 lg:px-6">
      <div className="mx-auto max-w-[1680px] space-y-4">
        <Card className="border-border/60 bg-background/75 shadow-sm">
          <CardHeader className="py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl leading-tight">Collection Report</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Staff Nickname: <span className="font-medium">{staffNickname || "-"}</span>
                  {activeSidebarItem ? <span> · Section: <span className="font-medium">{activeSidebarItem.label}</span></span> : null}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu className="mr-2 h-4 w-4" />
                Menu
              </Button>
            </div>
          </CardHeader>
        </Card>

        <div className="relative flex items-start gap-4">
          <motion.aside
            initial={false}
            animate={{ width: sidebarCollapsed ? 84 : 276 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="sticky top-4 hidden shrink-0 overflow-hidden rounded-xl border border-border/60 bg-background/70 p-2 shadow-sm lg:block"
          >
            <div className={cn("mb-2 flex", sidebarCollapsed ? "justify-center" : "justify-end")}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
              >
                {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </div>
            <nav className="space-y-1">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const active = subPage === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelectSubPage(item.key)}
                    className={cn(
                      "relative flex w-full items-center rounded-lg px-2 py-2 text-sm transition-colors",
                      sidebarCollapsed ? "justify-center" : "justify-start gap-3",
                      active ? "text-primary" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                    )}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    {active && (
                      <motion.span
                        layoutId="collection-sidebar-active"
                        className="absolute inset-0 rounded-lg border border-primary/35 bg-primary/10"
                        transition={{ duration: 0.14, ease: "easeOut" }}
                      />
                    )}
                    <span className="relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/60">
                      <Icon className="h-4 w-4" />
                    </span>
                    <AnimatePresence initial={false}>
                      {!sidebarCollapsed && (
                        <motion.span
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -6 }}
                          transition={{ duration: 0.16 }}
                          className="relative z-10 truncate font-medium"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                );
              })}
            </nav>
          </motion.aside>

          <AnimatePresence>
            {mobileSidebarOpen && (
              <>
                <motion.button
                  type="button"
                  className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] lg:hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setMobileSidebarOpen(false)}
                />
                <motion.aside
                  className="fixed inset-y-0 left-0 z-50 w-[290px] border-r border-border/70 bg-background p-3 shadow-xl lg:hidden"
                  initial={{ x: -320 }}
                  animate={{ x: 0 }}
                  exit={{ x: -320 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">Collection Navigation</p>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileSidebarOpen(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {sidebarItems.map((item) => {
                      const Icon = item.icon;
                      const active = subPage === item.key;
                      return (
                        <button
                          key={`mobile-${item.key}`}
                          type="button"
                          onClick={() => handleSelectSubPage(item.key)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                            active
                              ? "border border-primary/35 bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                          )}
                        >
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/60">
                            <Icon className="h-4 w-4" />
                          </span>
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </motion.aside>
              </>
            )}
          </AnimatePresence>

          <div className="min-w-0 flex-1">
            {!canAccessCollection ? (
              <Card className="border-border/60 bg-background/75 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl">Pengesahan Nickname Diperlukan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Sila lengkapkan pengesahan nickname dahulu sebelum meneruskan ke Collection Report.
                  </p>
                  <Button onClick={() => setNicknameDialogOpen(true)}>Buka Pengesahan Nickname</Button>
                </CardContent>
              </Card>
            ) : subPage === "save" ? (
              <SaveCollectionPage staffNickname={staffNickname} />
            ) : subPage === "records" ? (
              <CollectionRecordsPage role={role} />
            ) : subPage === "summary" ? (
              <CollectionSummaryPage role={role} />
            ) : (
              <ManageCollectionNicknamesPage
                role={role}
                currentNickname={staffNickname}
              />
            )}
          </div>
        </div>
      </div>

      <Dialog open={nicknameDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Masukkan Nama Staff Collection</DialogTitle>
            <DialogDescription>
              Sahkan nickname dahulu. Jika ini kali pertama, anda perlu tetapkan password nickname baharu.
            </DialogDescription>
          </DialogHeader>

          {dialogStep === "nickname" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Staff Nickname</Label>
                <Input
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder="Contoh: Sathia"
                  disabled={submittingNicknameAuth}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Sistem akan semak nickname dahulu sebelum teruskan ke langkah set password atau login.
              </p>
            </div>
          )}

          {dialogStep === "setup" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {setupMode === "forced-change"
                  ? "Sila tetapkan kata laluan baharu sebelum meneruskan."
                  : "Sila tetapkan kata laluan baharu untuk nickname ini sebelum meneruskan."}
              </p>
              <div className="space-y-2">
                <Label>Nickname</Label>
                <Input value={resolvedNickname} disabled />
              </div>
              <div className="space-y-2">
                <Label>New Password</Label>
                <div className="relative">
                  <Input
                    type={showSetupPassword ? "text" : "password"}
                    value={nicknamePassword}
                    onChange={(e) => setNicknamePassword(e.target.value)}
                    placeholder="Minimum 8 aksara"
                    className="pr-10"
                    disabled={submittingNicknameAuth}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowSetupPassword((prev) => !prev)}
                    disabled={submittingNicknameAuth}
                    aria-label={showSetupPassword ? "Hide password" : "Show password"}
                  >
                    {showSetupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <div className="relative">
                  <Input
                    type={showSetupConfirmPassword ? "text" : "password"}
                    value={confirmNicknamePassword}
                    onChange={(e) => setConfirmNicknamePassword(e.target.value)}
                    placeholder="Ulang password"
                    className="pr-10"
                    disabled={submittingNicknameAuth}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowSetupConfirmPassword((prev) => !prev)}
                    disabled={submittingNicknameAuth}
                    aria-label={showSetupConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showSetupConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {dialogStep === "login" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nickname</Label>
                <Input value={resolvedNickname} disabled />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    type={showLoginPassword ? "text" : "password"}
                    value={nicknamePassword}
                    onChange={(e) => setNicknamePassword(e.target.value)}
                    placeholder="Masukkan password nickname"
                    className="pr-10"
                    disabled={submittingNicknameAuth}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    disabled={submittingNicknameAuth}
                    aria-label={showLoginPassword ? "Hide password" : "Show password"}
                  >
                    {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={redirectToSearchTab}
              disabled={submittingNicknameAuth}
            >
              Close
            </Button>
            {dialogStep !== "nickname" && (
              <Button
                variant="outline"
                onClick={() => {
                  setDialogStep("nickname");
                  setNicknamePassword("");
                  setConfirmNicknamePassword("");
                  setVerifiedNicknamePassword("");
                  setSetupMode("first-time");
                  setShowLoginPassword(false);
                  setShowSetupPassword(false);
                  setShowSetupConfirmPassword(false);
                }}
                disabled={submittingNicknameAuth}
              >
                Kembali
              </Button>
            )}

            {dialogStep === "nickname" && (
              <Button onClick={() => void handleCheckNickname()} disabled={submittingNicknameAuth}>
                {submittingNicknameAuth ? "Checking..." : "Continue"}
              </Button>
            )}
            {dialogStep === "setup" && (
              <Button onClick={() => void handleSetupNicknamePassword()} disabled={submittingNicknameAuth}>
                {submittingNicknameAuth ? "Saving..." : "Save Password"}
              </Button>
            )}
            {dialogStep === "login" && (
              <Button onClick={() => void handleNicknameLogin()} disabled={submittingNicknameAuth}>
                {submittingNicknameAuth ? "Signing In..." : "Login Nickname"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
