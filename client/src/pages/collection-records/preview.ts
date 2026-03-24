export async function optimizeImageBlobForPreview(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith("image/") || blob.type === "image/webp") {
    return blob;
  }
  if (typeof document === "undefined") {
    return blob;
  }
  try {
    const objectUrl = URL.createObjectURL(blob);
    let image: HTMLImageElement | null = null;
    try {
      image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const draftImage = new Image();
        draftImage.onload = () => resolve(draftImage);
        draftImage.onerror = () => reject(new Error("Failed to decode receipt image."));
        draftImage.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }

    if (!image) {
      return blob;
    }
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

    image.src = "";
    canvas.width = 0;
    canvas.height = 0;

    return webpBlob || blob;
  } catch {
    // Fallback to original blob when browser-side optimization fails.
    return blob;
  }
}
