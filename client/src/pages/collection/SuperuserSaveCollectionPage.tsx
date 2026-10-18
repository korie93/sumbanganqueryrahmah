import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCollectionNicknames, type CollectionStaffNickname } from "@/lib/api";
import { CollectionNicknameSingleSelect } from "@/pages/collection-report/CollectionNicknameSingleSelect";
import SaveCollectionPage from "@/pages/collection/SaveCollectionPage";
import { parseApiError } from "@/pages/collection/utils";
import "./SuperuserSaveCollectionPage.css";

export default function SuperuserSaveCollectionPage() {
  const [nicknames, setNicknames] = useState<CollectionStaffNickname[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const selected = nicknames.find((nickname) => nickname.id === selectedId);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void getCollectionNicknames(undefined, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setNicknames(response.nicknames.filter((nickname) => nickname.isActive));
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(parseApiError(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  const handleSubmittingChange = useCallback((next: boolean) => {
    submittingRef.current = next;
    setSubmitting(next);
    if (next) setOpen(false);
  }, []);

  return (
    <div className="space-y-4">
      <section aria-label="Nickname Collection" className="collection-save-nickname">
          <div className="collection-save-nickname-controls">
            <div className="collection-save-nickname-picker">
              <CollectionNicknameSingleSelect
                label="Simpan untuk nickname"
                triggerId="save-collection-superuser-nickname"
                triggerClassName="min-h-11"
                open={open}
                onOpenChange={setOpen}
                loading={loading}
                disabled={submitting}
                selectedLabel={selected?.nickname || "Pilih nickname aktif"}
                options={nicknames.map((nickname) => nickname.nickname)}
                value={selected?.nickname || ""}
                onSelect={(nickname) => {
                  if (submittingRef.current) return;
                  setSelectedId(nicknames.find((option) => option.nickname === nickname)?.id || "");
                }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              aria-label="Muat Semula"
              title="Muat Semula"
              disabled={loading || submitting}
              onClick={() => setReload((current) => current + 1)}
            >
              <RotateCw className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Muat Semula</span>
            </Button>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {!loading && !error && nicknames.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              Tiada nickname aktif. Aktifkan atau tambah nickname di Manage Nicknames dahulu.
            </p>
          ) : null}
      </section>
      {selected ? (
        <SaveCollectionPage
          key={`${selected.id}:${selected.nickname}`}
          staffNickname={selected.nickname}
          accessSuspended={loading}
          onSubmittingChange={handleSubmittingChange}
        />
      ) : null}
    </div>
  );
}
