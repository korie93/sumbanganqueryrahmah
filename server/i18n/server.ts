import {
  enServerMessages,
  type EnServerMessageKey,
} from "../locales/en/server";

export type ServerMessageKey = EnServerMessageKey;

export function t(key: ServerMessageKey): string {
  return enServerMessages[key];
}

export { enServerMessages };
