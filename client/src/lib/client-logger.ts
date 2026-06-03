export type ClientLoggerEnvironment = {
  DEV?: boolean;
  VITE_CLIENT_DEBUG?: string | undefined;
};

export function shouldLogClientDiagnostics(env: ClientLoggerEnvironment = import.meta.env): boolean {
  return Boolean(env?.DEV || env?.VITE_CLIENT_DEBUG === "1");
}

function buildClientLogArguments(
  message: string,
  error?: unknown,
  details?: unknown,
): unknown[] {
  const args: unknown[] = [message];
  if (error !== undefined) {
    args.push(error);
  }
  if (details !== undefined) {
    args.push(details);
  }
  return args;
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

  console.error(...buildClientLogArguments(message, error, details));
}

export function logClientWarning(
  message: string,
  error?: unknown,
  details?: unknown,
  env: ClientLoggerEnvironment = import.meta.env,
): void {
  if (!shouldLogClientDiagnostics(env)) {
    return;
  }

  console.warn(...buildClientLogArguments(message, error, details));
}
