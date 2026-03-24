async function loadImageElementFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);

  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load receipt image."));
      image.src = objectUrl;
    });

    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to decode receipt image."));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function optimizeImageBlobForPreview(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith("image/") || blob.type === "image/webp") {
    return blob;
  }
  if (typeof document === "undefined") {
    return blob;
  }
  try {
    const image = await loadImageElementFromBlob(blob);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      return blob;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return blob;
    }

    context.drawImage(image, 0, 0, width, height);

    const webpBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.82);
    });

    return webpBlob || blob;
  } catch {
    // Fallback to original blob when browser-side optimization fails.
    return blob;
  }
}
