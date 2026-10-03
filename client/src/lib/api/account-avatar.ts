import { ACCOUNT_AVATAR_ENDPOINT, type AccountAvatarUpload } from "@shared/account-avatar";
import { authUserMutationResponseSchema } from "@shared/api-contracts";
import { apiRequest } from "../api-client";
import { parseApiJson } from "./contract";

export async function updateAccountAvatar(payload: AccountAvatarUpload, signal: AbortSignal) {
  const response = await apiRequest("PUT", ACCOUNT_AVATAR_ENDPOINT, payload, { signal, timeoutMs: 60_000 });
  const result = await parseApiJson(response, authUserMutationResponseSchema, ACCOUNT_AVATAR_ENDPOINT);
  if (!result.user) throw new Error("Account photo response is missing.");
  return result.user;
}
