import { useEffect, useState } from "react";
import type { ReceiptPreviewKind } from "@/pages/collection-records/types";
import { resolveReceiptPreviewKind } from "@/pages/collection-records/utils";

export type CollectionReceiptDraftPreview = {
  key: string;
  file: File;
  url: string;
  kind: ReceiptPreviewKind;
};

export function formatCollectionReceiptFileSize(bytes: number): string {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function useCollectionReceiptDraftPreviews(
  files: File[],
): CollectionReceiptDraftPreview[] {
  const [previews, setPreviews] = useState<CollectionReceiptDraftPreview[]>([]);

  useEffect(() => {
    const nextPreviews = files.map((file, index) => {
      const url = URL.createObjectURL(file);
      return {
        key: `${file.name}-${file.size}-${file.lastModified}-${index}`,
        file,
        url,
        kind: resolveReceiptPreviewKind({
          mimeType: file.type,
          fileName: file.name,
        }),
      } satisfies CollectionReceiptDraftPreview;
    });

    setPreviews(nextPreviews);

    return () => {
      for (const preview of nextPreviews) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [files]);

  return previews;
}
