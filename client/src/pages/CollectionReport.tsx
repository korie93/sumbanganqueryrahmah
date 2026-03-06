import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, FolderPlus, ListChecks, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
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
  const [submittingNicknameAuth, setSubmittingNicknameAuth] = useState(false);

  const canAccessCollection = isSuperuser
    ? true
    : Boolean(staffNickname && nicknameSessionVerified);

  const clearNicknameSession = useCallback(() => {
    sessionStorage.removeItem(COLLECTION_STAFF_NICKNAME_KEY);
    sessionStorage.removeItem(COLLECTION_STAFF_NICKNAME_AUTH_KEY);
    setStaffNickname("");
    setNicknameSessionVerified(false);
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
      if (response?.nickname?.requiresPasswordSetup) {
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
    if (nicknamePassword !== confirmNicknamePassword) {
      toast({
        title: "Validation Error",
        description: "Password dan confirm password tidak sepadan.",
        variant: "destructive",
      });
      return;
    }

    setSubmittingNicknameAuth(true);
    try {
      const response = await setupCollectionNicknamePassword({
        nickname,
        newPassword: nicknamePassword,
        confirmPassword: confirmNicknamePassword,
      });
      const activeNickname = String(response?.nickname?.nickname || nickname).trim();
      applyNicknameSession(activeNickname);
      setDialogStep("nickname");
      setNicknamePassword("");
      setConfirmNicknamePassword("");
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
      const activeNickname = String(response?.nickname?.nickname || nickname).trim();
      applyNicknameSession(activeNickname);
      setDialogStep("nickname");
      setNicknamePassword("");
      setConfirmNicknamePassword("");
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

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <Card className="border-border/60 bg-background/70">
          <CardHeader>
            <div>
              <CardTitle className="text-2xl">Collection Report</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Staff Nickname: <span className="font-medium">{staffNickname || "-"}</span>
              </p>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-12 gap-6">
          <Card className="col-span-12 lg:col-span-3 border-border/60 bg-background/70">
            <CardHeader>
              <CardTitle className="text-lg">Collection Report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <button
                type="button"
                onClick={() => setSubPage("save")}
                className={`w-full text-left rounded-md border px-3 py-2 transition ${
                  subPage === "save" ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:bg-accent/40"
                }`}
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  <FolderPlus className="w-4 h-4" />
                  Simpan Collection Individual
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSubPage("records")}
                className={`w-full text-left rounded-md border px-3 py-2 transition ${
                  subPage === "records" ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:bg-accent/40"
                }`}
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  <ListChecks className="w-4 h-4" />
                  View Rekod Collection
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSubPage("summary")}
                className={`w-full text-left rounded-md border px-3 py-2 transition ${
                  subPage === "summary" ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:bg-accent/40"
                }`}
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  <BarChart3 className="w-4 h-4" />
                  Collection Summary
                </span>
              </button>
              {isSuperuser && (
                <button
                  type="button"
                  onClick={() => setSubPage("manage-nicknames")}
                  className={`w-full text-left rounded-md border px-3 py-2 transition ${
                    subPage === "manage-nicknames" ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:bg-accent/40"
                  }`}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Settings2 className="w-4 h-4" />
                    Manage Nickname
                  </span>
                </button>
              )}
            </CardContent>
          </Card>

          <div className="col-span-12 lg:col-span-9">
            {!canAccessCollection ? (
              <Card className="border-border/60 bg-background/70">
                <CardHeader>
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
                Sila tetapkan kata laluan baharu untuk nickname ini sebelum meneruskan.
              </p>
              <div className="space-y-2">
                <Label>Nickname</Label>
                <Input value={resolvedNickname} disabled />
              </div>
              <div className="space-y-2">
                <Label>New Password</Label>
                <Input
                  type="password"
                  value={nicknamePassword}
                  onChange={(e) => setNicknamePassword(e.target.value)}
                  placeholder="Minimum 8 aksara"
                  disabled={submittingNicknameAuth}
                />
              </div>
              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <Input
                  type="password"
                  value={confirmNicknamePassword}
                  onChange={(e) => setConfirmNicknamePassword(e.target.value)}
                  placeholder="Ulang password"
                  disabled={submittingNicknameAuth}
                />
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
                <Input
                  type="password"
                  value={nicknamePassword}
                  onChange={(e) => setNicknamePassword(e.target.value)}
                  placeholder="Masukkan password nickname"
                  disabled={submittingNicknameAuth}
                />
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
