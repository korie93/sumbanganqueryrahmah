export type ActiveImportUploadQuotaTracker = {
  tryReserve(subject: string, bytes: number): boolean;
  release(subject: string, bytes: number): void;
  getUsage(subject: string): number;
};

function normalizeQuotaSubject(subject: string) {
  return String(subject || "").trim().toLowerCase();
}

export function createActiveImportUploadQuotaTracker(limitBytes: number): ActiveImportUploadQuotaTracker {
  const normalizedLimitBytes = Math.max(1, Math.floor(Number(limitBytes) || 0));
  const usageBySubject = new Map<string, number>();

  return {
    tryReserve(subject: string, bytes: number) {
      const normalizedSubject = normalizeQuotaSubject(subject);
      const normalizedBytes = Math.max(1, Math.floor(Number(bytes) || 0));
      if (!normalizedSubject) {
        return true;
      }

      const currentUsage = usageBySubject.get(normalizedSubject) ?? 0;
      if (currentUsage + normalizedBytes > normalizedLimitBytes) {
        return false;
      }

      usageBySubject.set(normalizedSubject, currentUsage + normalizedBytes);
      return true;
    },

    release(subject: string, bytes: number) {
      const normalizedSubject = normalizeQuotaSubject(subject);
      const normalizedBytes = Math.max(1, Math.floor(Number(bytes) || 0));
      if (!normalizedSubject) {
        return;
      }

      const currentUsage = usageBySubject.get(normalizedSubject) ?? 0;
      const nextUsage = currentUsage - normalizedBytes;
      if (nextUsage > 0) {
        usageBySubject.set(normalizedSubject, nextUsage);
        return;
      }

      usageBySubject.delete(normalizedSubject);
    },

    getUsage(subject: string) {
      const normalizedSubject = normalizeQuotaSubject(subject);
      if (!normalizedSubject) {
        return 0;
      }
      return usageBySubject.get(normalizedSubject) ?? 0;
    },
  };
}
