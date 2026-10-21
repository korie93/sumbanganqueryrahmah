import { z } from "zod";
import { apiRequest } from "../api-client";
import { parseApiJson } from "./contract";

const linkSchema = z.object({
  nicknameId: z.string().nullable(),
  nickname: z.string().nullable(),
  accountRole: z.string(),
  isActive: z.boolean(),
}).nullable();
const responseSchema = z.object({ ok: z.literal(true), link: linkSchema });
const nicknameOptionsSchema = z.object({
  ok: z.literal(true),
  nicknames: z.array(z.object({ id: z.string(), nickname: z.string() })),
});
const optionsSchema = responseSchema.merge(nicknameOptionsSchema);
export type DashboardAccountOptions = z.infer<typeof optionsSchema>;
const endpoint = (id: string) => `/api/collection/dashboard-accounts/${encodeURIComponent(id)}`;

export async function getDashboardAccountLink(id: string, signal: AbortSignal) {
  const url = endpoint(id);
  return parseApiJson(await apiRequest("GET", url, undefined, { signal, timeoutMs: 60_000 }), optionsSchema, url);
}
export async function setDashboardAccountLink(id: string, nicknameId: string | null) {
  const url = endpoint(id);
  return parseApiJson(await apiRequest("PUT", url, { nicknameId }), responseSchema, url);
}

export async function getCreateDashboardNicknames(role: "user" | "admin", signal: AbortSignal) {
  const url = `/api/admin/users/dashboard-nicknames?role=${encodeURIComponent(role)}`;
  return parseApiJson(await apiRequest("GET", url, undefined, { signal, timeoutMs: 60_000 }), nicknameOptionsSchema, url);
}
