export const AI_REQUEST_MAX_CHARACTERS = 3_000;

export function normalizeAiRequestTextInput(value: string): string {
  return value.length > AI_REQUEST_MAX_CHARACTERS
    ? value.slice(0, AI_REQUEST_MAX_CHARACTERS)
    : value;
}

export function isAiRequestTextTooLong(value: string): boolean {
  return value.trim().length > AI_REQUEST_MAX_CHARACTERS;
}
