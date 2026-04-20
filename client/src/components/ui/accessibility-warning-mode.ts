export function resolveDevelopmentAccessibilityWarningMode(params: {
  hasWindow: boolean;
  nodeEnv?: string | null | undefined;
  viteDev?: boolean | null | undefined;
}) {
  if (!params.hasWindow) {
    return false;
  }

  if (typeof params.viteDev === "boolean") {
    return params.viteDev;
  }

  const normalizedNodeEnv = String(params.nodeEnv || "").trim().toLowerCase();
  return normalizedNodeEnv === "development" || normalizedNodeEnv === "test";
}

export function shouldWarnForMissingAccessibilityName() {
  return resolveDevelopmentAccessibilityWarningMode({
    hasWindow: typeof window !== "undefined",
    nodeEnv: typeof process !== "undefined" ? process.env.NODE_ENV : undefined,
    viteDev: import.meta.env?.DEV,
  });
}
