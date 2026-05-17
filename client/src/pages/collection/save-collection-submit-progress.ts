import type { SaveCollectionSubmitFailure } from "@/pages/collection/save-collection-submit-feedback";

export type SaveCollectionSubmitPhase = "idle" | "processing" | "saved" | "failed";

export type SaveCollectionProgressStepState = "complete" | "active" | "pending" | "failed";

export type SaveCollectionProgressStep = {
  id: "validate" | "upload" | "scan" | "save" | "done";
  label: string;
  description: string;
  state: SaveCollectionProgressStepState;
};

function resolveProcessingStepState(params: {
  phase: SaveCollectionSubmitPhase;
  failure: SaveCollectionSubmitFailure | null;
  requestStep: boolean;
}): SaveCollectionProgressStepState {
  if (params.phase === "saved") return "complete";
  if (params.phase === "failed") {
    if (params.failure?.kind === "validation" && !params.requestStep) return "failed";
    if (params.failure?.kind === "request" && params.requestStep) return "failed";
    return params.requestStep ? "pending" : "complete";
  }
  if (params.phase === "processing") return params.requestStep ? "active" : "complete";
  return "pending";
}

export function buildSaveCollectionProgressSteps(params: {
  phase: SaveCollectionSubmitPhase;
  receiptCount: number;
  failure: SaveCollectionSubmitFailure | null;
}): SaveCollectionProgressStep[] {
  const receiptCount = Math.max(0, Number.isFinite(params.receiptCount) ? Math.trunc(params.receiptCount) : 0);
  const hasReceipts = receiptCount > 0;

  return [
    {
      id: "validate",
      label: "Validate form",
      description: "Semak maklumat wajib dan format asas.",
      state: resolveProcessingStepState({
        phase: params.phase,
        failure: params.failure,
        requestStep: false,
      }),
    },
    {
      id: "upload",
      label: "Upload receipt",
      description: hasReceipts
        ? `${receiptCount} receipt dihantar bersama rekod.`
        : "Tiada receipt pending untuk upload.",
      state: hasReceipts
        ? resolveProcessingStepState({
          phase: params.phase,
          failure: params.failure,
          requestStep: true,
        })
        : params.phase === "processing" || params.phase === "saved"
          ? "complete"
          : "pending",
    },
    {
      id: "scan",
      label: "Malware scan",
      description: hasReceipts
        ? "Receipt diimbas sebelum disimpan."
        : "Scan hanya berjalan jika receipt dilampirkan.",
      state: hasReceipts
        ? resolveProcessingStepState({
          phase: params.phase,
          failure: params.failure,
          requestStep: true,
        })
        : params.phase === "processing" || params.phase === "saved"
          ? "complete"
          : "pending",
    },
    {
      id: "save",
      label: "Save record",
      description: "Rekod collection disimpan selepas semakan selesai.",
      state: resolveProcessingStepState({
        phase: params.phase,
        failure: params.failure,
        requestStep: true,
      }),
    },
    {
      id: "done",
      label: "Done",
      description: "Rekod akan kosong semula selepas berjaya disimpan.",
      state: params.phase === "saved" ? "complete" : "pending",
    },
  ];
}
