import { apiRequest } from "./queryClient";

export * from "./api/activity";
export * from "./api/ai";
export * from "./api/analytics";
export * from "./api/auth";
export * from "./api/audit";
export * from "./api/backups";
export * from "./api/collection";
export * from "./api/imports";
export * from "./api/monitor";
export * from "./api/search";
export * from "./api/settings";

export async function aiChat(message: string, conversationId?: string | null) {
  const response = await apiRequest("POST", "/api/ai/chat", {
    message,
    conversationId: conversationId || null,
  });
  return response.json();
}

export async function getAiConfig() {
  const response = await apiRequest("GET", "/api/ai/config");
  return response.json();
}

export async function aiIndexImport(importId: string, batchSize: number, maxRows?: number) {
  const response = await apiRequest("POST", `/api/ai/index/import/${importId}`, {
    batchSize,
    maxRows,
  });
  return response.json();
}
