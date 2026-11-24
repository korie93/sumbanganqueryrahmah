import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { fetchOfflineSelectionDetail } from "@/lib/api/collection-records";
import type { CollectionRecord } from "@/lib/api/collection-types";
import { parseCollectionApiErrorDetails } from "@/pages/collection/utils";
import { CollectionRecordDetailsContent } from "./CollectionRecordName";
import type { ViewCollectionReceipt } from "./types";

export function OfflineReceiptIssueDetail({ id, onViewReceipt, onAccessLost }: {
  id: string;
  onViewReceipt: ViewCollectionReceipt;
  onAccessLost: () => void;
}) {
  const [record, setRecord] = useState<CollectionRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);

  async function openDetails() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await fetchOfflineSelectionDetail(id, controller.signal);
      if (!controller.signal.aborted) setRecord(result);
    } catch (cause) {
      if (controller.signal.aborted) return;
      const { status } = parseCollectionApiErrorDetails(cause);
      if (status === 401 || status === 403) onAccessLost();
      else setError(status === 404 ? "Rekod ini tidak lagi tersedia." : "Butiran rekod gagal dimuatkan. Cuba semula.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        pending.current = null;
      }
    }
  }

  return (
    <Dialog open={!!record} onOpenChange={(open) => { if (open) void openDetails(); else setRecord(null); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={loading}>
          {loading ? "Memuatkan butiran…" : "Buka butiran rekod"}
        </Button>
      </DialogTrigger>
      {error ? <p role="alert" className="basis-full text-xs">{error}</p> : null}
      {record ? <CollectionRecordDetailsContent record={record} onViewReceipt={onViewReceipt} /> : null}
    </Dialog>
  );
}
