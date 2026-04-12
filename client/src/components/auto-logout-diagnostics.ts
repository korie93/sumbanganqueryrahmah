import { toast } from "@/hooks/use-toast"
import { persistAuthNotice } from "@/lib/auth-session"

export function isAutoLogoutDiagnosticsEnabled() {
  return Boolean(import.meta.env?.DEV || import.meta.env?.VITE_AUTO_LOGOUT_DEBUG === "1")
}

export function warnAutoLogoutDiagnostic(message: string, error?: unknown) {
  if (!isAutoLogoutDiagnosticsEnabled()) {
    return
  }

  globalThis.console?.warn?.(message, error)
}

export function notifyAutoLogoutNotice(reason: unknown, fallback: string) {
  const message = String(reason || fallback).trim() || fallback
  persistAuthNotice(message)
  toast({
    title: "Sesi Dikemaskini",
    description: message,
    variant: "destructive",
  })
}
