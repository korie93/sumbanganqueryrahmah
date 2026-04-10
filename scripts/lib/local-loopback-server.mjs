import net from "node:net";

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);

function formatHostForUrl(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function normalizePort(port, fallbackPort = 5000) {
  const parsed = Number.parseInt(String(port ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackPort;
  }
  return parsed;
}

async function isPortAvailable({ host, port }) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();

    probe.once("error", (error) => {
      if (error && typeof error === "object" && "code" in error) {
        const errorCode = String(error.code || "");
        if (errorCode === "EADDRINUSE" || errorCode === "EACCES") {
          resolve(false);
          return;
        }
      }

      reject(error);
    });

    probe.listen(port, host, () => {
      probe.close(() => resolve(true));
    });
  });
}

export function isLoopbackBaseUrl(baseUrl) {
  try {
    const parsed = new URL(String(baseUrl || "").trim());
    return LOOPBACK_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function buildLoopbackBaseUrl({ host = "127.0.0.1", port = 5000 } = {}) {
  return `http://${formatHostForUrl(String(host || "127.0.0.1").trim() || "127.0.0.1")}:${normalizePort(port)}`;
}

export async function resolveAvailableLoopbackPort({
  host = "127.0.0.1",
  preferredPort = 5000,
  maxAttempts = 20,
} = {}) {
  const normalizedHost = String(host || "127.0.0.1").trim() || "127.0.0.1";
  const normalizedPort = normalizePort(preferredPort);

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidatePort = normalizedPort + offset;
    if (await isPortAvailable({ host: normalizedHost, port: candidatePort })) {
      return candidatePort;
    }
  }

  throw new Error(
    `Could not find an available loopback port starting at ${normalizedPort} for host ${normalizedHost} after ${maxAttempts} attempts.`,
  );
}

export async function resolveManagedLoopbackBaseUrl({
  configuredBaseUrl,
  host = "127.0.0.1",
  preferredPort = 5000,
  allowPortFallback = true,
  maxAttempts = 20,
} = {}) {
  const normalizedHost = String(host || "127.0.0.1").trim() || "127.0.0.1";
  const normalizedPort = normalizePort(preferredPort);
  const fallbackBaseUrl = buildLoopbackBaseUrl({
    host: normalizedHost,
    port: normalizedPort,
  });
  const candidateBaseUrl = String(configuredBaseUrl || "").trim() || fallbackBaseUrl;

  if (!allowPortFallback || !isLoopbackBaseUrl(candidateBaseUrl)) {
    return {
      baseUrl: candidateBaseUrl,
      host: normalizedHost,
      port: normalizedPort,
      usedFallbackPort: false,
    };
  }

  const resolvedPort = await resolveAvailableLoopbackPort({
    host: normalizedHost,
    preferredPort: normalizedPort,
    maxAttempts,
  });

  return {
    baseUrl: buildLoopbackBaseUrl({
      host: normalizedHost,
      port: resolvedPort,
    }),
    host: normalizedHost,
    port: resolvedPort,
    usedFallbackPort: resolvedPort !== normalizedPort,
  };
}
