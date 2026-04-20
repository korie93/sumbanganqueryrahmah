export function resolveDevelopmentAccessibilityWarningMode(params: {
  hasWindow: boolean;
  nodeEnv?: string | null | undefined;
  viteDev?: boolean | null | undefined;
  viteProd?: boolean | null | undefined;
}) {
  if (!params.hasWindow) {
    return false;
  }

  if (typeof params.viteDev === "boolean") {
    if (params.viteDev) {
      return true;
    }
  }

  const normalizedNodeEnv = String(params.nodeEnv || "").trim().toLowerCase();
  if (normalizedNodeEnv === "development" || normalizedNodeEnv === "test") {
    return true;
  }

  if (params.viteProd === true || normalizedNodeEnv === "production") {
    return false;
  }

  // Browser runtimes that are not explicitly production should keep the warning path
  // enabled so development/test diagnostics do not silently disappear.
  return true;
}

export function shouldWarnForMissingAccessibilityName() {
  return resolveDevelopmentAccessibilityWarningMode({
    hasWindow: typeof window !== "undefined",
    nodeEnv: typeof process !== "undefined" ? process.env.NODE_ENV : undefined,
    viteDev: import.meta.env?.DEV,
    viteProd: import.meta.env?.PROD,
  });
}
