export type ClientLoggerEnvironment = {
  DEV?: boolean;
  VITE_CLIENT_DEBUG?: string | undefined;
};

export function shouldLogClientDiagnostics(env: ClientLoggerEnvironment = import.meta.env): boolean {
  return Boolean(env?.DEV || env?.VITE_CLIENT_DEBUG === "1");
}

export function logClientError(
  message: string,
  error?: unknown,
  details?: unknown,
  env: ClientLoggerEnvironment = import.meta.env,
): void {
  if (!shouldLogClientDiagnostics(env)) {
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
