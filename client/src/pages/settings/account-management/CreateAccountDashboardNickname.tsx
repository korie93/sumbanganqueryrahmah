import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import { getCreateDashboardNicknames } from "@/lib/api/collection-dashboard-account";
import type { ManagedUserCreateRole } from "../settings-managed-user-create-shared";

type Props = {
  role: ManagedUserCreateRole;
  selectedId: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

export function CreateAccountDashboardNickname({ role, selectedId, disabled, onChange }: Props) {
  const [expanded, setExpanded] = useState(Boolean(selectedId));
  const [options, setOptions] = useState<Array<{ id: string; nickname: string }> | null>(null);
  const [error, setError] = useState("");
  const [lastChosenName, setLastChosenName] = useState("");
  const [attempt, setAttempt] = useState(0);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const selectId = useId();
  const helpId = useId();
  const selectedName = options?.find((item) => item.id === selectedId)?.nickname || lastChosenName || "Nickname dipilih";

  useEffect(() => {
    const nickname = options?.find((item) => item.id === selectedId)?.nickname;
    if (nickname) setLastChosenName(nickname);
  }, [options, selectedId]);

  useEffect(() => {
    if (!expanded || role === "manager") return;
    const controller = new AbortController();
    setOptions(null);
    setError("");
    void getCreateDashboardNicknames(role, controller.signal).then((result) => {
      if (!controller.signal.aborted) setOptions(result.nicknames);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Tiada senarai nickname buat masa ini. Cuba semula atau tetapkan kemudian.");
    });
    return () => controller.abort();
  }, [expanded, role, attempt]);

  return <section aria-label="Kutipan Dashboard ketika cipta akaun" className="min-w-0 rounded-md border border-border/70">
    {role === "manager" ? <div className="space-y-2 p-3">
      <h3 className="text-sm font-medium">Kutipan Dashboard</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">Manager melihat semua kutipan bulanan mengikut permission; nickname tidak diperlukan.</p>
    </div> : <>
      <h3>
        <Button ref={toggleRef} type="button" variant="ghost" disabled={disabled}
          {...getAriaExpandedProps(expanded)} aria-controls={panelId}
          className="w-full min-w-0 justify-between gap-3 whitespace-normal px-3 py-2.5 text-left sm:min-h-11"
          onClick={() => setExpanded((value) => !value)}>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium">Kutipan Dashboard</span>
              <span className="text-xs font-normal text-muted-foreground">Pilihan</span>
            </span>
            {selectedId ? <span className="mt-1 block break-words text-xs font-normal text-muted-foreground">Dipilih: {selectedName}</span> : null}
          </span>
          <ChevronDown aria-hidden="true" className={`shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} />
        </Button>
      </h3>
      <div id={panelId} hidden={!expanded} className="min-w-0 space-y-2 px-3 pb-3 pt-1">
        <p className="text-xs leading-relaxed text-muted-foreground">Boleh dipautkan sekarang atau kemudian melalui Details akaun. Akaun tetap memerlukan pengaktifan emel.</p>
        {options === null && !error ? <p role="status" className="text-xs text-muted-foreground">Memuatkan nickname…</p> : null}
        {error ? <div className="space-y-2">
          <p role="alert" className="text-xs text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setAttempt((value) => value + 1)}>Cuba semula</Button>
        </div> : null}
        {options ? <>
          <label htmlFor={selectId} className="block text-sm font-medium">Nickname Dashboard</label>
          <select id={selectId} value={selectedId} disabled={disabled} aria-describedby={helpId}
            onChange={(event) => onChange(event.target.value)}
            className="min-h-11 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">Tetapkan kemudian</option>
            {options.map((item) => <option key={item.id} value={item.id}>{item.nickname}</option>)}
          </select>
          {options.length === 0 ? <p className="text-xs text-muted-foreground">Tiada nickname aktif yang sesuai. Akaun masih boleh dicipta tanpa pautan.</p> : null}
        </> : null}
        {selectedId ? <Button type="button" variant="ghost" size="sm" disabled={disabled} className="max-w-full whitespace-normal" onClick={() => {
          onChange("");
          toggleRef.current?.focus({ preventScroll: true });
        }}>Tetapkan kemudian</Button> : null}
        <p id={helpId} className="text-xs leading-relaxed text-muted-foreground">
          {role === "admin" ? "Ringkasan kutipan ketua dan ahli kumpulan aktif." : "Ringkasan kutipan sendiri sahaja."}{" "}
          Pilihan ini hanya untuk ringkasan Dashboard. Pengesahan nickname masih diperlukan untuk masuk Collection.
        </p>
      </div>
    </>}
  </section>;
}
