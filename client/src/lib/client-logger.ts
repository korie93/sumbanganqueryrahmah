function shouldLogClientDiagnostics(): boolean {
  return Boolean(import.meta.env?.DEV || import.meta.env?.VITE_CLIENT_DEBUG === "1");
}

export function logClientError(message: string, error?: unknown, details?: unknown): void {
  if (!shouldLogClientDiagnostics()) {
    return;
  }

  if (details !== undefined) {
    console.error(message, error, details);
    return;
  }

  if (error !== undefined) {
    console.error(message, error);
    return;
  }

  console.error(message);
}
