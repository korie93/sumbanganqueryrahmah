import { useEffect, useRef, useState, type PointerEvent } from "react";
import { RotateCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AVATAR_OUTPUT_SIZE, avatarCropGeometry, boundAvatarCrop, drawAvatarCrop, exportAvatarCrop, initialAvatarCrop, validAvatarDimensions, zoomAvatarCrop, type AvatarCrop } from "./avatar-crop";

export function AvatarEditor({ file, saving, error, onSave, onClose, returnFocus }: {
  file: File; saving: boolean; error: string; onSave: (file: File) => Promise<void>; onClose: () => void; returnFocus: () => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState(initialAvatarCrop);
  const [processing, setProcessing] = useState(false);
  const [problem, setProblem] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLButtonElement>(null);
  const aliveRef = useRef(false);
  const processingRef = useRef(false);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const busy = processing || saving;

  useEffect(() => {
    aliveRef.current = true;
    const url = URL.createObjectURL(file);
    const decoded = new Image();
    const timer = window.setTimeout(() => { decoded.src = ""; if (aliveRef.current) setProblem("The photo took too long to load. Please choose another image."); }, 10_000);
    decoded.onload = () => {
      window.clearTimeout(timer);
      if (!aliveRef.current) return;
      if (!validAvatarDimensions(decoded.naturalWidth, decoded.naturalHeight)) {
        setProblem("Choose a photo no larger than 2048 × 2048 pixels."); return;
      }
      setImage(decoded);
    };
    decoded.onerror = () => { window.clearTimeout(timer); if (aliveRef.current) setProblem("The photo could not be displayed. Choose a valid image."); };
    decoded.src = url;
    return () => { aliveRef.current = false; window.clearTimeout(timer); decoded.onload = null; decoded.onerror = null; decoded.src = ""; URL.revokeObjectURL(url); };
  }, [file]);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    try { drawAvatarCrop(canvasRef.current, image, crop); }
    catch { setProblem("Photo editing is unavailable in this browser."); }
  }, [image, crop]);

  const move = (x: number, y: number) => {
    if (!image || busy) return;
    setCrop((current) => boundAvatarCrop(image.naturalWidth, image.naturalHeight, { ...current, x: current.x + x, y: current.y + y }));
  };
  const zoom = (value: number) => {
    if (!image || busy) return;
    setCrop((current) => zoomAvatarCrop(image.naturalWidth, image.naturalHeight, current, value));
  };
  const stopDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const save = async () => {
    if (!image || saving || processingRef.current || problem) return;
    processingRef.current = true; setProcessing(true);
    try {
      const result = await exportAvatarCrop(image, crop);
      if (aliveRef.current) await onSave(result);
    } catch { if (aliveRef.current) setProblem("The photo could not be processed. Cancel and choose another image."); }
    finally { processingRef.current = false; if (aliveRef.current) setProcessing(false); }
  };
  const geometry = image ? avatarCropGeometry(image.naturalWidth, image.naturalHeight, crop) : null;
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="account-photo-dialog" aria-busy={busy} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}
      onOpenAutoFocus={(event) => { event.preventDefault(); stageRef.current?.focus(); }}
      onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>Adjust profile photo</DialogTitle><DialogDescription>Your current photo stays the same until you save.</DialogDescription></DialogHeader>
      <button ref={stageRef} type="button" className="account-crop-stage" aria-label="Reposition photo" aria-describedby="avatar-crop-instructions" aria-disabled={!image || busy}
        onPointerDown={(event) => {
          if (!image || busy || dragRef.current || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.id !== event.pointerId) return;
          const ratio = AVATAR_OUTPUT_SIZE / event.currentTarget.getBoundingClientRect().width;
          move((event.clientX - drag.x) * ratio, (event.clientY - drag.y) * ratio);
          dragRef.current = { id: drag.id, x: event.clientX, y: event.clientY };
        }} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={() => { dragRef.current = null; }}
        onKeyDown={(event) => {
          const moves: Record<string, [number, number]> = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
          const delta = moves[event.key];
          if (delta) { event.preventDefault(); move(...delta); }
          else if (["+", "=", "-"].includes(event.key)) { event.preventDefault(); zoom(crop.zoom + (event.key === "-" ? -0.1 : 0.1)); }
        }}>
        <canvas ref={canvasRef} data-testid="avatar-crop-preview" aria-hidden="true" width={512} height={512}
          data-rotation={crop.rotation} data-zoom={crop.zoom} data-offset-x={geometry?.x ?? 0} data-offset-y={geometry?.y ?? 0} />
        {!image && !problem ? <span className="account-photo-loading">Loading photo…</span> : null}
      </button>
      <p id="avatar-crop-instructions" className="account-photo-help">Drag or use arrow keys to reposition. Use + / − or the slider to zoom.</p>
      <label className="account-crop-zoom" htmlFor="avatar-zoom"><span>Zoom</span><input id="avatar-zoom" aria-label="Zoom" type="range" min="1" max="4" step="0.01" value={crop.zoom}
        disabled={!image || busy} onChange={(event) => zoom(Number(event.target.value))} /><output htmlFor="avatar-zoom">{Math.round(crop.zoom * 100)}%</output></label>
      <div className="account-photo-tools">
        <Button type="button" variant="outline" disabled={!image || busy} aria-label="Rotate clockwise" onClick={() => setCrop((current) => ({ ...initialAvatarCrop(), rotation: ((current.rotation + 90) % 360) as AvatarCrop["rotation"] }))}><RotateCw aria-hidden="true" />Rotate</Button>
        <Button type="button" variant="ghost" disabled={!image || busy} aria-label="Reset crop" onClick={() => setCrop(initialAvatarCrop())}><RotateCcw aria-hidden="true" />Reset</Button>
      </div>
      <p className="account-photo-help">Saved as a 512 × 512 image. Original photo metadata is not included.</p>
      {problem || error ? <p role="alert" className="personal-error">{problem || error}</p> : null}
      <div className="account-photo-dialog-actions">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="button" data-testid="avatar-save" disabled={!image || busy || Boolean(problem)} onClick={() => void save()}>{busy ? "Saving…" : "Save photo"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
