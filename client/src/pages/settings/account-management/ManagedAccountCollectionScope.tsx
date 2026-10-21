import { useEffect, useId, useRef, useState } from "react";
import { CircleAlert, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getDashboardAccountLink, setDashboardAccountLink, type DashboardAccountOptions } from "@/lib/api/collection-dashboard-account";
import { getAriaExpandedProps } from "@/lib/aria-state-props";

export function ManagedAccountCollectionScope({ userId, role }: { userId: string; role: string }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<DashboardAccountOptions | null>(null);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [removeOpen, setRemoveOpen] = useState(false);
  const generation = useRef(0);
  const mutationPending = useRef(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const selectId = useId();
  const scopeId = useId();
  const noteId = useId();

  // Read only the account whose Details are open, not every account table row.
  useEffect(() => {
    const controller = new AbortController();
    const request = ++generation.current;
    setOptions(null);
    setSelected("");
    setLoadError("");
    setSaveError("");
    setMessage("");
    setSaving(false);
    setRemoveOpen(false);
    mutationPending.current = false;
    void getDashboardAccountLink(userId, controller.signal).then((data) => {
      if (controller.signal.aborted || request !== generation.current) return;
      setOptions(data);
      setSelected(data.link?.isActive ? data.link.nicknameId ?? "" : "");
    }).catch(() => {
      if (!controller.signal.aborted && request === generation.current) setLoadError("Tetapan tidak dapat dimuatkan. Cuba semula.");
    });
    return () => { controller.abort(); generation.current++; };
  }, [attempt, userId, role]);

  const savedId = options?.link?.isActive ? options.link.nicknameId ?? "" : "";
  const selectedNickname = options?.nicknames.find((item) => item.id === selected);
  const canSave = Boolean(options && selectedNickname && selected !== savedId && !saving);
  const hasLink = Boolean(options?.link?.nicknameId);
  const needsReview = hasLink && !options?.link?.isActive;
  const status = !options ? loadError ? "Status tidak tersedia" : "Memuatkan status…"
    : needsReview ? "Perlu semakan"
    : options.link?.isActive ? `Dipautkan: ${options.link.nickname ?? "Nickname Collection"}`
    : options.link ? "Tiada pautan" : "Belum ditetapkan";

  const save = async (nicknameId: string | null) => {
    if (!options || mutationPending.current || (nicknameId === null ? !hasLink : !canSave || nicknameId !== selected)) return;
    const request = generation.current;
    mutationPending.current = true;
    setSaving(true);
    setSaveError("");
    setMessage("");
    try {
      const result = await setDashboardAccountLink(userId, nicknameId);
      // Leaving Details cannot undo a server-accepted write; discard late UI responses.
      if (request !== generation.current) return;
      setOptions((current) => current ? { ...current, link: result.link } : current);
      setSelected(result.link?.isActive ? result.link.nicknameId ?? "" : "");
      setRemoveOpen(false);
      setMessage(nicknameId === null ? "Pautan Dashboard dibuang. Rekod Collection tidak dipadam." : "Pautan Dashboard disimpan.");
    } catch {
      if (request === generation.current) setSaveError(nicknameId === null
        ? "Pautan tidak dapat dibuang. Cuba semula."
        : "Pautan tidak dapat disimpan. Semak nickname dan cuba semula.");
    } finally {
      if (request === generation.current) { mutationPending.current = false; setSaving(false); }
    }
  };

  return <section aria-label="Kutipan Dashboard" className="min-w-0 space-y-3 border-t border-border/70 pt-4">
    <div className="min-w-0 space-y-1.5">
      <h3 className="text-sm font-semibold">Kutipan Dashboard</h3>
      <p aria-live="polite" aria-atomic="true" className="flex min-w-0 items-start gap-2 text-sm font-medium">
        {needsReview ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          : <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <span className="min-w-0 break-words">{status}</span>
      </p>
      <p className="text-sm text-muted-foreground">{role === "admin"
        ? "Pautkan nickname ketua untuk ringkasan kutipan kumpulan tanpa login Collection."
        : "Pautkan nickname untuk ringkasan kutipan sendiri tanpa login Collection."}</p>
    </div>
    {loadError ? <div className="space-y-2">
      <p role="alert" className="text-sm text-destructive">{loadError}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>Cuba semula</Button>
    </div> : null}
    <Button ref={toggleRef} type="button" variant="outline" size="sm" disabled={saving}
      {...getAriaExpandedProps(open)} aria-controls={panelId} onClick={() => setOpen(!open)}
      className="max-w-full whitespace-normal text-left">
      {open ? "Tutup tetapan nickname" : "Tetapkan nickname Dashboard"}
    </Button>
    <div id={panelId} hidden={!open} className="min-w-0 space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
      {!options && !loadError ? <p role="status" className="text-sm text-muted-foreground">Memuatkan nickname…</p> : null}
      {options ? <>
        {needsReview ? <p className="text-sm text-muted-foreground">Pautan terdahulu tidak aktif atau tidak sesuai dengan peranan akaun. Pilih nickname yang betul.</p> : null}
        <div className="min-w-0 space-y-2">
          <Label htmlFor={selectId}>Nickname Collection</Label>
          <select ref={selectRef} id={selectId} disabled={saving || options.nicknames.length === 0} value={selected}
            aria-describedby={`${scopeId} ${noteId}`}
            onChange={(event) => { setSelected(event.target.value); setMessage(""); setSaveError(""); }}
            className="min-h-11 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="" disabled>Pilih nickname{role === "admin" ? " ketua" : ""}</option>
            {options.nicknames.map((item) => <option key={item.id} value={item.id}>{item.nickname}</option>)}
          </select>
        </div>
        <p id={scopeId} className="min-w-0 break-words text-sm text-muted-foreground">
          {selectedNickname ? <><span className="font-medium text-foreground">{selectedNickname.nickname}</span>{role === "admin"
            ? " — Dashboard memaparkan kutipan ketua dan ahli kumpulan aktif."
            : " — Dashboard memaparkan kutipan nickname ini sahaja."}</>
            : options.nicknames.length === 0 ? "Tiada nickname aktif yang sesuai dengan peranan akaun ini."
            : "Pilih nickname untuk menyemak skop kutipan Dashboard."}
        </p>
        <p id={noteId} className="text-xs leading-relaxed text-muted-foreground">Pautan ini hanya menentukan ringkasan Dashboard. Pengesahan nickname masih diperlukan untuk masuk Collection.</p>
        {saveError && !removeOpen ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={!canSave} onClick={() => { void save(selected); }}
            className="max-w-full whitespace-normal">
            {saving && !removeOpen ? "Menyimpan…" : "Simpan pautan Dashboard"}
          </Button>
          {hasLink ? <AlertDialog open={removeOpen} onOpenChange={(value) => {
            if (mutationPending.current) return;
            setRemoveOpen(value); setSaveError("");
          }}>
            <AlertDialogTrigger asChild>
              <Button ref={removeRef} type="button" variant="outline" size="sm" disabled={saving}>
                <Trash2 aria-hidden="true" />Buang pautan
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent overlayClassName="z-[var(--z-modal-content)]" onCloseAutoFocus={(event) => {
              const target = [removeRef.current, selectRef.current, toggleRef.current]
                .find((element) => element?.isConnected && !element.disabled);
              if (target) { event.preventDefault(); target.focus({ preventScroll: true }); }
            }}>
              <AlertDialogHeader className="text-left">
                <AlertDialogTitle>Buang pautan Dashboard?</AlertDialogTitle>
                <AlertDialogDescription className="break-words">
                  Pautan kepada {options.link?.nickname ?? "nickname ini"} akan dibuang. Akaun ini tidak lagi melihat {role === "admin" ? "ringkasan kutipan kumpulan" : "ringkasan kutipan nickname ini"} di Dashboard sehingga pautan ditetapkan semula oleh superuser. Rekod Collection dan resit tidak dipadam.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel>
                <AlertDialogAction disabled={saving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(event) => { event.preventDefault(); void save(null); }}>
                  {saving ? "Membuang…" : "Ya, buang pautan"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog> : null}
        </div>
      </> : null}
    </div>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </section>;
}
