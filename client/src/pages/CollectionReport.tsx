import { useEffect, useMemo, useState } from "react";
import { BarChart3, FolderPlus, ListChecks, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import CollectionRecordsPage from "@/pages/collection/CollectionRecordsPage";
import CollectionSummaryPage from "@/pages/collection/CollectionSummaryPage";
import SaveCollectionPage from "@/pages/collection/SaveCollectionPage";
import { COLLECTION_STAFF_NICKNAME_KEY, getCurrentRole } from "@/pages/collection/utils";

type CollectionSubPage = "save" | "records" | "summary";

function getSubPageFromPath(pathname: string): CollectionSubPage {
  const normalized = pathname.toLowerCase();
  if (normalized.startsWith("/collection/summary")) return "summary";
  if (normalized.startsWith("/collection/records")) return "records";
  return "save";
}

function getPathForSubPage(subPage: CollectionSubPage): string {
  if (subPage === "summary") return "/collection/summary";
  return subPage === "records" ? "/collection/records" : "/collection/save";
}

export default function CollectionReport() {
  const { toast } = useToast();
  const role = useMemo(() => getCurrentRole(), []);

  const [subPage, setSubPage] = useState<CollectionSubPage>(() => {
    if (typeof window === "undefined") return "save";
    return getSubPageFromPath(window.location.pathname || "/collection/save");
  });

  const [staffNickname, setStaffNickname] = useState(() => {
    if (typeof window === "undefined") return "";
    return String(sessionStorage.getItem(COLLECTION_STAFF_NICKNAME_KEY) || "").trim();
  });
  const [nicknameDraft, setNicknameDraft] = useState(staffNickname);
  const [nicknameDialogOpen, setNicknameDialogOpen] = useState(!staffNickname);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const targetPath = getPathForSubPage(subPage);
    if (window.location.pathname.toLowerCase() !== targetPath.toLowerCase()) {
      window.history.replaceState({}, "", targetPath);
    }
  }, [subPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      setSubPage(getSubPageFromPath(window.location.pathname || "/collection/save"));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openNicknameDialog = () => {
    setNicknameDraft(staffNickname);
    setNicknameDialogOpen(true);
  };

  const handleSaveNickname = () => {
    const normalized = String(nicknameDraft || "").trim();
    if (normalized.length < 2) {
      toast({
        title: "Validation Error",
        description: "Staff nickname mesti sekurang-kurangnya 2 aksara.",
        variant: "destructive",
      });
      return;
    }

    sessionStorage.setItem(COLLECTION_STAFF_NICKNAME_KEY, normalized);
    setStaffNickname(normalized);
    setNicknameDialogOpen(false);
    toast({
      title: "Staff Nickname Set",
      description: `Nama staff collection: ${normalized}`,
    });
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <Card className="border-border/60 bg-background/70">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">Collection Report</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Staff Nickname: <span className="font-medium">{staffNickname || "-"}</span>
              </p>
            </div>
            <Button variant="outline" onClick={openNicknameDialog}>
              <UserRound className="w-4 h-4 mr-2" />
              Tukar Nama Staff
            </Button>
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
            </CardContent>
          </Card>

          <div className="col-span-12 lg:col-span-9">
            {subPage === "save" ? (
              <SaveCollectionPage staffNickname={staffNickname} />
            ) : subPage === "records" ? (
              <CollectionRecordsPage role={role} />
            ) : (
              <CollectionSummaryPage />
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={nicknameDialogOpen}
        onOpenChange={(open) => {
          if (!open && !staffNickname) return;
          setNicknameDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Masukkan Nama Staff Collection</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Staff Nickname</Label>
            <Input
              value={nicknameDraft}
              onChange={(e) => setNicknameDraft(e.target.value)}
              placeholder="Contoh: Sathia"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button onClick={handleSaveNickname}>Mulakan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
