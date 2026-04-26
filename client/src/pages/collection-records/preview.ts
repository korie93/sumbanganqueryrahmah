const DEFAULT_MAX_PREVIEW_EDGE = 2_048;
const DEFAULT_MAX_PREVIEW_PIXELS = 4_194_304;
const PREVIEW_WEBP_QUALITY = 0.82;

export const RECEIPT_IMAGE_PREVIEW_MAX_EDGE = 1_600;
export const RECEIPT_IMAGE_PREVIEW_MAX_PIXELS = 2_000_000;

type OptimizeImageBlobForPreviewOptions = {
  signal?: AbortSignal;
  maxEdge?: number;
  maxPixels?: number;
};

type PreviewDrawable = HTMLImageElement | ImageBitmap;

type FitImagePreviewDimensionsOptions = {
  maxEdge?: number;
  maxPixels?: number;
};

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("Preview generation aborted.", "AbortError");
  }

  const error = new Error("Preview generation aborted.");
  error.name = "AbortError";
  return error;
}

function assertPreviewSignalOpen(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function fitImagePreviewDimensions(
  width: number,
  height: number,
  {
    maxEdge = DEFAULT_MAX_PREVIEW_EDGE,
    maxPixels = DEFAULT_MAX_PREVIEW_PIXELS,
  }: FitImagePreviewDimensionsOptions = {},
): { width: number; height: number } {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  const safeMaxEdge = Number(maxEdge);
  const safeMaxPixels = Number(maxPixels);

  if (
    !Number.isFinite(safeWidth)
    || !Number.isFinite(safeHeight)
    || !Number.isFinite(safeMaxEdge)
    || !Number.isFinite(safeMaxPixels)
    || safeWidth <= 0
    || safeHeight <= 0
    || safeMaxEdge <= 0
    || safeMaxPixels <= 0
  ) {
    return { width: 0, height: 0 };
  }

  let scale = Math.min(1, safeMaxEdge / Math.max(safeWidth, safeHeight));
  let scaledWidth = safeWidth * scale;
  let scaledHeight = safeHeight * scale;

  if (scaledWidth * scaledHeight > safeMaxPixels) {
    const pixelScale = Math.sqrt(safeMaxPixels / (scaledWidth * scaledHeight));
    scale *= pixelScale;
    scaledWidth = safeWidth * scale;
    scaledHeight = safeHeight * scale;
  }

  let targetWidth = Math.max(1, Math.floor(scaledWidth));
  let targetHeight = Math.max(1, Math.floor(scaledHeight));

  while (targetWidth * targetHeight > safeMaxPixels) {
    if (targetWidth >= targetHeight) {
      targetWidth = Math.max(1, targetWidth - 1);
    } else {
      targetHeight = Math.max(1, targetHeight - 1);
    }
  }

  return {
    width: targetWidth,
    height: targetHeight,
  };
}

function shouldKeepOriginalPreviewBlob(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  targetHeight: number,
): boolean {
  return originalWidth === targetWidth && originalHeight === targetHeight;
}

async function loadImageElementForPreview(
  blob: Blob,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  assertPreviewSignalOpen(signal);

  const objectUrl = URL.createObjectURL(blob);

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();

      const cleanupAbortListener = () => {
        signal?.removeEventListener("abort", handleAbort);
      };

      const handleAbort = () => {
        image.src = "";
        cleanupAbortListener();
        reject(createAbortError());
      };

      image.onload = () => {
        cleanupAbortListener();
        resolve(image);
      };
      image.onerror = () => {
        cleanupAbortListener();
        reject(new Error("Failed to decode receipt image."));
      };

      if (signal) {
        signal.addEventListener("abort", handleAbort, { once: true });
      }

      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadPreviewDrawable(
  blob: Blob,
  signal?: AbortSignal,
): Promise<PreviewDrawable> {
  assertPreviewSignalOpen(signal);

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      assertPreviewSignalOpen(signal);
      return bitmap;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
    }
  }

  return loadImageElementForPreview(blob, signal);
}

async function renderPreviewBlob(
  drawable: PreviewDrawable,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Blob | null> {
  assertPreviewSignalOpen(signal);

  const canvas = document.createElement("canvas");

  try {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.drawImage(drawable, 0, 0, width, height);
    assertPreviewSignalOpen(signal);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", PREVIEW_WEBP_QUALITY);
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function optimizeImageBlobForPreview(
  blob: Blob,
  {
    signal,
    maxEdge = DEFAULT_MAX_PREVIEW_EDGE,
    maxPixels = DEFAULT_MAX_PREVIEW_PIXELS,
  }: OptimizeImageBlobForPreviewOptions = {},
): Promise<Blob> {
  if (!blob.type.startsWith("image/") || typeof document === "undefined") {
    return blob;
  }

  let drawable: PreviewDrawable | null = null;

  try {
    drawable = await loadPreviewDrawable(blob, signal);
    const width = "naturalWidth" in drawable ? drawable.naturalWidth || drawable.width : drawable.width;
    const height = "naturalHeight" in drawable ? drawable.naturalHeight || drawable.height : drawable.height;

    if (!width || !height) {
      return blob;
    }

    const targetDimensions = fitImagePreviewDimensions(width, height, {
      maxEdge,
      maxPixels,
    });

    if (
      !targetDimensions.width
      || !targetDimensions.height
      || shouldKeepOriginalPreviewBlob(
        width,
        height,
        targetDimensions.width,
        targetDimensions.height,
      )
    ) {
      return blob;
    }

    const previewBlob = await renderPreviewBlob(
      drawable,
      targetDimensions.width,
      targetDimensions.height,
      signal,
    );

    return previewBlob || blob;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    // Fallback to the original blob when browser-side optimization fails.
    return blob;
  } finally {
    if (drawable && "close" in drawable) {
      drawable.close();
    } else if (drawable && "src" in drawable) {
      drawable.src = "";
    }
  }
}
