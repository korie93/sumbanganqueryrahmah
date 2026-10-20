import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getDashboardAccountLink, setDashboardAccountLink, type DashboardAccountOptions } from "@/lib/api/collection-dashboard-account";
import { getAriaExpandedProps } from "@/lib/aria-state-props";

export function ManagedAccountCollectionScope({ userId, role }: { userId: string; role: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return <section className="space-y-2 border-t border-border/70 pt-4">
    <h3 className="text-sm font-semibold">Kutipan Dashboard</h3>
    <p className="text-sm text-muted-foreground">{role === "admin"
      ? "Pautkan nickname ketua untuk memaparkan kutipan kumpulannya sebelum login Collection."
      : "Pautkan nickname untuk memaparkan kutipan sendiri sebelum login Collection."}</p>
    <Button type="button" variant="outline" size="sm" {...getAriaExpandedProps(open)} aria-controls={panelId} onClick={() => setOpen(!open)}>
      {open ? "Tutup tetapan nickname" : "Tetapkan nickname Dashboard"}
    </Button>
    <div id={panelId} hidden={!open}>
      {open ? <ScopeEditor key={`${userId}:${role}`} userId={userId} /> : null}
    </div>
  </section>;
}

function ScopeEditor({ userId }: { userId: string }) {
  const [options, setOptions] = useState<DashboardAccountOptions | null>(null);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const request = ++generation.current;
    setError("");
    void getDashboardAccountLink(userId, controller.signal).then((data) => {
      if (controller.signal.aborted || request !== generation.current) return;
      setOptions(data);
      setSelected(data.link?.isActive ? data.link.nicknameId ?? "" : "");
    }).catch(() => {
      if (!controller.signal.aborted && request === generation.current) setError("Tetapan tidak dapat dimuatkan. Cuba semula.");
    });
    return () => { controller.abort(); generation.current++; };
  }, [attempt, userId]);
  const save = async () => {
    if (!options || saving) return;
    const request = generation.current;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await setDashboardAccountLink(userId, selected || null);
      if (request !== generation.current) return;
      setOptions((current) => current ? { ...current, link: result.link } : current);
      setMessage("Pautan Dashboard disimpan.");
    } catch {
      if (request === generation.current) setError("Pautan tidak dapat disimpan. Semak nickname dan cuba semula.");
    } finally {
      if (request === generation.current) setSaving(false);
    }
  };
  return <div className="space-y-2">
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {!options ? error
      ? <Button type="button" variant="outline" size="sm" onClick={() => setAttempt(attempt + 1)}>Cuba semula</Button>
      : <p role="status" className="text-sm text-muted-foreground">Memuatkan nickname…</p>
      : <>
        {options.link?.nicknameId && !options.link.isActive ? <p className="text-sm text-muted-foreground">Pautan terdahulu tidak aktif atau tidak sesuai dengan peranan akaun. Pilih nickname yang betul.</p> : null}
        <Label htmlFor="dashboard-account-nickname">Nickname Collection</Label>
        <select id="dashboard-account-nickname" disabled={saving} value={selected}
          onChange={(event) => { setSelected(event.target.value); setMessage(""); }}
          className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="">Tiada pautan</option>
          {options.nicknames.map((item) => <option key={item.id} value={item.id}>{item.nickname}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">Pautan ini hanya menentukan ringkasan Dashboard. Pengesahan nickname masih diperlukan untuk masuk Collection.</p>
        <Button type="button" size="sm" disabled={saving} onClick={() => { void save(); }}>
          {saving ? "Menyimpan…" : "Simpan pautan Dashboard"}
        </Button>
      </>}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </div>;
}
