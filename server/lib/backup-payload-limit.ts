export class BackupPayloadTooLargeError extends Error {
  readonly code = "BACKUP_PAYLOAD_TOO_LARGE";
  readonly limitBytes: number;
  readonly payloadBytes?: number;

  constructor(limitBytes: number, payloadBytes?: number) {
    super(buildBackupPayloadTooLargeMessage(limitBytes));
    this.name = "BackupPayloadTooLargeError";
    this.limitBytes = Math.max(1, Math.trunc(limitBytes));
    if (typeof payloadBytes === "number" && Number.isFinite(payloadBytes)) {
      this.payloadBytes = Math.max(0, Math.trunc(payloadBytes));
    }
  }
}

function formatBackupPayloadLimit(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  if (bytes < 1024 * 1024) {
    const kibibytes = bytes / 1024;
    if (kibibytes >= 10) {
      return `${Math.round(kibibytes)} KiB`;
    }
    return `${kibibytes.toFixed(1)} KiB`;
  }
  const mebibytes = bytes / (1024 * 1024);
  if (mebibytes >= 10) {
    return `${Math.round(mebibytes)} MiB`;
  }
  return `${mebibytes.toFixed(1)} MiB`;
}

export function buildBackupPayloadTooLargeMessage(limitBytes: number) {
  return `Backup payload exceeds the configured ${formatBackupPayloadLimit(limitBytes)} limit. Narrow the dataset or increase BACKUP_MAX_PAYLOAD_BYTES.`;
}

export function isBackupPayloadTooLargeError(error: unknown): error is BackupPayloadTooLargeError {
  return error instanceof BackupPayloadTooLargeError
    || String((error as { code?: string })?.code || "") === "BACKUP_PAYLOAD_TOO_LARGE";
}
