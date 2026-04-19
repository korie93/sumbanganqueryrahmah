import { useEffect, useRef, useState } from "react";
import type { ReceiptPreviewKind } from "@/pages/collection-records/types";
import { resolveReceiptPreviewKind } from "@/pages/collection-records/utils";

export type CollectionReceiptDraftPreview = {
  key: string;
  file: File;
  url: string;
  kind: ReceiptPreviewKind;
};

const MAX_COLLECTION_RECEIPT_PREVIEW_EDGE = 320;

function createCollectionReceiptDraftFileIdResolver() {
  const fileIds = new WeakMap<File, string>();
  let nextId = 0;

  return (file: File): string => {
    const existingId = fileIds.get(file);
    if (existingId) {
      return existingId;
    }

    const createdId = `collection-receipt-draft-${nextId++}`;
    fileIds.set(file, createdId);
    return createdId;
  };
}

export function fitCollectionReceiptPreviewDimensions(
  width: number,
  height: number,
  maxEdge = MAX_COLLECTION_RECEIPT_PREVIEW_EDGE,
): { width: number; height: number } {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  const safeMaxEdge = Number(maxEdge);
  if (
    !Number.isFinite(safeWidth)
    || !Number.isFinite(safeHeight)
    || !Number.isFinite(safeMaxEdge)
    || safeWidth <= 0
    || safeHeight <= 0
    || safeMaxEdge <= 0
  ) {
    return { width: 0, height: 0 };
  }

  const scale = Math.min(1, safeMaxEdge / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function revokeCollectionReceiptDraftPreview(preview: CollectionReceiptDraftPreview | null | undefined) {
  if (!preview?.url) {
    return;
  }

  URL.revokeObjectURL(preview.url);
}

export function disposeCollectionReceiptDraftPreviewCache(
  previewCache: Map<string, CollectionReceiptDraftPreview>,
) {
  for (const preview of previewCache.values()) {
    revokeCollectionReceiptDraftPreview(preview);
  }
  previewCache.clear();
}

export function pruneCollectionReceiptDraftPreviewCache(
  previewCache: Map<string, CollectionReceiptDraftPreview>,
  activeFileIds: ReadonlySet<string>,
) {
  for (const [fileId, preview] of previewCache.entries()) {
    if (activeFileIds.has(fileId)) {
      continue;
    }

    revokeCollectionReceiptDraftPreview(preview);
    previewCache.delete(fileId);
  }
}

function buildCollectionReceiptDraftPreviewKey(fileId: string): string {
  return fileId;
}

function orderCollectionReceiptDraftPreviews(
  files: readonly File[],
  previewCache: ReadonlyMap<string, CollectionReceiptDraftPreview>,
  resolveFileId: (file: File) => string,
): CollectionReceiptDraftPreview[] {
  const orderedPreviews: CollectionReceiptDraftPreview[] = [];

  for (const file of files) {
    const preview = previewCache.get(resolveFileId(file));
    if (preview) {
      orderedPreviews.push(preview);
    }
  }

  return orderedPreviews;
}

async function createImageElementThumbnailUrl(file: File): Promise<string> {
  const sourceUrl = URL.createObjectURL(file);
  let image: HTMLImageElement | null = null;
  const canvas = document.createElement("canvas");

  try {
    image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Failed to decode receipt image."));
      nextImage.src = sourceUrl;
    });

    const dimensions = fitCollectionReceiptPreviewDimensions(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
    );
    if (!dimensions.width || !dimensions.height) {
      return "";
    }

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return "";
    }

    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
    const thumbnailBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.72);
    });

    return thumbnailBlob ? URL.createObjectURL(thumbnailBlob) : "";
  } finally {
    if (image) {
      image.src = "";
    }
    canvas.width = 0;
    canvas.height = 0;
    URL.revokeObjectURL(sourceUrl);
  }
}

async function createBitmapThumbnailUrl(file: File): Promise<string> {
  if (typeof createImageBitmap !== "function") {
    return createImageElementThumbnailUrl(file);
  }

  let bitmap: ImageBitmap | null = null;
  const canvas = document.createElement("canvas");

  try {
    bitmap = await createImageBitmap(file);
    const dimensions = fitCollectionReceiptPreviewDimensions(bitmap.width, bitmap.height);
    if (!dimensions.width || !dimensions.height) {
      return "";
    }

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return "";
    }

    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    const thumbnailBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.72);
    });

    return thumbnailBlob ? URL.createObjectURL(thumbnailBlob) : "";
  } catch {
    return createImageElementThumbnailUrl(file);
  } finally {
    bitmap?.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function createCollectionReceiptDraftPreview(
  file: File,
  fileId: string,
): Promise<CollectionReceiptDraftPreview> {
  const kind = resolveReceiptPreviewKind({
    mimeType: file.type,
    fileName: file.name,
  });

  let url = "";
  if (kind === "image" && typeof document !== "undefined") {
    url = await createBitmapThumbnailUrl(file);
  }

  return {
    key: buildCollectionReceiptDraftPreviewKey(fileId),
    file,
    url,
    kind,
  } satisfies CollectionReceiptDraftPreview;
}

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
  const previewCacheRef = useRef<Map<string, CollectionReceiptDraftPreview>>(new Map());
  const resolveFileIdRef = useRef<(file: File) => string>(createCollectionReceiptDraftFileIdResolver());

  useEffect(() => {
    return () => {
      disposeCollectionReceiptDraftPreviewCache(previewCacheRef.current);
    };
  }, []);

  useEffect(() => {
    const previewCache = previewCacheRef.current;
    const resolveFileId = resolveFileIdRef.current;
    const activeFileIds = new Set(files.map((file) => resolveFileId(file)));

    pruneCollectionReceiptDraftPreviewCache(previewCache, activeFileIds);

    setPreviews(orderCollectionReceiptDraftPreviews(files, previewCache, resolveFileId));

    const missingFiles = files.filter((file) => !previewCache.has(resolveFileId(file)));
    if (!missingFiles.length) {
      return;
    }

    let disposed = false;

    void (async () => {
      for (const file of missingFiles) {
        const fileId = resolveFileId(file);
        if (previewCache.has(fileId)) {
          continue;
        }

        const preview = await createCollectionReceiptDraftPreview(file, fileId);
        if (disposed || !activeFileIds.has(fileId) || previewCache.has(fileId)) {
          revokeCollectionReceiptDraftPreview(preview);
          continue;
        }

        previewCache.set(fileId, preview);
        setPreviews(orderCollectionReceiptDraftPreviews(files, previewCache, resolveFileId));
      }
    })();

    return () => {
      disposed = true;
    };
  }, [files]);

  return previews;
}
