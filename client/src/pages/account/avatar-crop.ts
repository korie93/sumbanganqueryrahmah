import { ACCOUNT_AVATAR_MAX_BYTES, ACCOUNT_AVATAR_MAX_EDGE, ACCOUNT_AVATAR_MIME_TYPES } from "@shared/account-avatar";

export const AVATAR_OUTPUT_SIZE = 512;
export type AvatarCrop = { rotation: 0 | 90 | 180 | 270; zoom: number; x: number; y: number };
export const initialAvatarCrop = (): AvatarCrop => ({ rotation: 0, zoom: 1, x: 0, y: 0 });

export function validateAvatarSource(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!file.size || file.size > ACCOUNT_AVATAR_MAX_BYTES || !(ACCOUNT_AVATAR_MIME_TYPES as readonly string[]).includes(file.type)
    || !/\.(png|jpe?g|webp)$/i.test(file.name)) return "Choose a PNG, JPEG or WebP photo up to 1 MB.";
  return null;
}

export function validAvatarDimensions(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    && width <= ACCOUNT_AVATAR_MAX_EDGE && height <= ACCOUNT_AVATAR_MAX_EDGE;
}

export function avatarCropGeometry(width: number, height: number, crop: AvatarCrop) {
  if (!validAvatarDimensions(width, height)) throw new Error("Choose a photo no larger than 2048 × 2048 pixels.");
  const rotated = crop.rotation === 90 || crop.rotation === 270;
  const rotatedWidth = rotated ? height : width;
  const rotatedHeight = rotated ? width : height;
  const zoom = Math.max(1, Math.min(4, Number.isFinite(crop.zoom) ? crop.zoom : 1));
  const scale = AVATAR_OUTPUT_SIZE / Math.min(rotatedWidth, rotatedHeight) * zoom;
  const maxX = (rotatedWidth * scale - AVATAR_OUTPUT_SIZE) / 2;
  const maxY = (rotatedHeight * scale - AVATAR_OUTPUT_SIZE) / 2;
  const bounded = (value: number, limit: number) => Math.max(-limit, Math.min(limit, Number.isFinite(value) ? value : 0));
  return { scale, zoom, x: bounded(crop.x, maxX), y: bounded(crop.y, maxY) };
}

export function boundAvatarCrop(width: number, height: number, crop: AvatarCrop): AvatarCrop {
  const { zoom, x, y } = avatarCropGeometry(width, height, crop);
  return { rotation: crop.rotation, zoom, x, y };
}

export function zoomAvatarCrop(width: number, height: number, crop: AvatarCrop, zoom: number): AvatarCrop {
  const nextZoom = Math.max(1, Math.min(4, Number.isFinite(zoom) ? zoom : 1));
  return boundAvatarCrop(width, height, { ...crop, zoom: nextZoom, x: crop.x * nextZoom / crop.zoom, y: crop.y * nextZoom / crop.zoom });
}

export function drawAvatarCrop(canvas: HTMLCanvasElement, image: HTMLImageElement, crop: AvatarCrop) {
  const { scale, x, y } = avatarCropGeometry(image.naturalWidth, image.naturalHeight, crop);
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo editing is unavailable in this browser.");
  context.translate(AVATAR_OUTPUT_SIZE / 2 + x, AVATAR_OUTPUT_SIZE / 2 + y);
  context.rotate(crop.rotation * Math.PI / 180);
  context.scale(scale, scale);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
}

/** Re-encode only the visible square; original metadata and file name are never uploaded. */
export async function exportAvatarCrop(image: HTMLImageElement, crop: AvatarCrop): Promise<File> {
  const canvas = document.createElement("canvas");
  drawAvatarCrop(canvas, image, crop);
  try {
    for (const type of ["image/webp", "image/jpeg"] as const) {
      if (type === "image/jpeg") {
        const context = canvas.getContext("2d")!;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalCompositeOperation = "destination-over";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
      if (blob?.type === type && blob.size > 0 && blob.size <= ACCOUNT_AVATAR_MAX_BYTES) {
        return new File([blob], type === "image/webp" ? "avatar.webp" : "avatar.jpg", { type });
      }
    }
    throw new Error("The photo could not be processed. Please choose a different image.");
  } finally { canvas.width = 0; canvas.height = 0; }
}
