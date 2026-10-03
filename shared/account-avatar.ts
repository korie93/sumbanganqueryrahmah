/** Personal avatars are private images; they are never public upload URLs. */
export const ACCOUNT_AVATAR_MAX_BYTES = 1024 * 1024;
export const ACCOUNT_AVATAR_MAX_BASE64_LENGTH = Math.ceil(ACCOUNT_AVATAR_MAX_BYTES / 3) * 4;
export const ACCOUNT_AVATAR_MAX_EDGE = 2048;
export const ACCOUNT_AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const ACCOUNT_AVATAR_ENDPOINT = "/api/me/avatar";

export type AccountAvatarUpload = {
  fileName: string;
  mimeType: typeof ACCOUNT_AVATAR_MIME_TYPES[number];
  contentBase64: string;
};
