export const OBJECT_URL_REVOKE_DELAY_MS = 250;

const MAX_DOWNLOAD_FILENAME_LENGTH = 255;
const OBJECT_URL_PENDING_REVOKE_TIMEOUT_ID = -1;
const activeObjectUrls = new Map<string, number>();

export function sanitizeDownloadFilename(rawFilename: string) {
  const sanitized = rawFilename
    .replace(/[^\w.\-\s]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, MAX_DOWNLOAD_FILENAME_LENGTH)
    .replace(/^[._-]+$/g, "");

  return sanitized || "download";
}

function revokeTrackedObjectUrl(objectUrl: string) {
  const timeoutId = activeObjectUrls.get(objectUrl);
  if (timeoutId !== undefined && timeoutId !== OBJECT_URL_PENDING_REVOKE_TIMEOUT_ID) {
    window.clearTimeout(timeoutId);
  }

  if (activeObjectUrls.delete(objectUrl)) {
    URL.revokeObjectURL(objectUrl);
  }
}

export function revokeAllObjectUrls() {
  for (const objectUrl of [...activeObjectUrls.keys()]) {
    revokeTrackedObjectUrl(objectUrl);
  }
}

export function getActiveDownloadObjectUrlCount() {
  return activeObjectUrls.size;
}

export function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);

  link.href = objectUrl;
  link.download = sanitizeDownloadFilename(filename);
  link.style.display = "none";

  let clickError: unknown;
  try {
    document.body?.appendChild(link);
    link.click();
  } catch (error) {
    clickError = error;
  }

  try {
    link.remove();
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }

  if (clickError) {
    URL.revokeObjectURL(objectUrl);
    throw clickError;
  }

  activeObjectUrls.set(objectUrl, OBJECT_URL_PENDING_REVOKE_TIMEOUT_ID);
  let timeoutId: number;
  try {
    timeoutId = window.setTimeout(() => {
      revokeTrackedObjectUrl(objectUrl);
    }, OBJECT_URL_REVOKE_DELAY_MS);
  } catch (error) {
    revokeTrackedObjectUrl(objectUrl);
    throw error;
  }
  if (activeObjectUrls.has(objectUrl)) {
    activeObjectUrls.set(objectUrl, timeoutId);
  }

  return () => {
    revokeTrackedObjectUrl(objectUrl);
  };
}
