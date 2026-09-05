import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCollectionNicknames, type CollectionStaffNickname } from "@/lib/api";
import { CollectionNicknameSingleSelect } from "@/pages/collection-report/CollectionNicknameSingleSelect";
import SaveCollectionPage from "@/pages/collection/SaveCollectionPage";
import { parseApiError } from "@/pages/collection/utils";

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
      <Card>
        <CardHeader>
          <CardTitle>Nickname Collection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <CollectionNicknameSingleSelect
                label="Simpan untuk nickname"
                triggerId="save-collection-superuser-nickname"
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
              disabled={loading || submitting}
              onClick={() => setReload((current) => current + 1)}
            >
              Muat Semula
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Pilih nickname yang menerima collection. Menukar nickname mengosongkan butiran pelanggan
            dan receipt semasa; draf bayaran disimpan berasingan bagi setiap nickname.
          </p>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {!loading && !error && nicknames.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              Tiada nickname aktif. Aktifkan atau tambah nickname di Manage Nicknames dahulu.
            </p>
          ) : null}
        </CardContent>
      </Card>
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
