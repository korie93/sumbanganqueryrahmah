import type { AIChatStatus } from "@/components/AIChat";

export function resolveFloatingAIMinimizedStatus(aiStatus: AIChatStatus): string {
  if (aiStatus === "SEARCHING") return "AI sedang mencari maklumat...";
  if (aiStatus === "PROCESSING") return "AI sedang memproses data...";
  if (aiStatus === "TYPING") return "AI sedang menaip jawapan...";
  return "AI sedang memproses...";
}
