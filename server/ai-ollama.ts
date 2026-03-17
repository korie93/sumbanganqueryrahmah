import { runtimeConfig } from "./config/runtime";

export type OllamaMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const OLLAMA_HOST = runtimeConfig.ai.host;
const OLLAMA_CHAT_MODEL = runtimeConfig.ai.chatModel;
const OLLAMA_EMBED_MODEL = runtimeConfig.ai.embedModel;
const MAX_OLLAMA_MESSAGES = 50;

function ensureText(input: string) {
  return (input || "").trim();
}

export async function ollamaEmbed(input: string): Promise<number[]> {
  const prompt = ensureText(input);
  if (!prompt) return [];

  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_EMBED_MODEL,
      prompt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama embeddings failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return Array.isArray(data.embedding) ? data.embedding : [];
}

export async function ollamaChat(
  messages: OllamaMessage[],
  options?: { num_predict?: number; temperature?: number; top_p?: number; timeoutMs?: number }
): Promise<string> {
  const timeoutMs = Number(options?.timeoutMs ?? runtimeConfig.ai.timeoutMs);
  const boundedMessages = Array.isArray(messages)
    ? messages.slice(Math.max(0, messages.length - MAX_OLLAMA_MESSAGES))
    : [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_CHAT_MODEL,
        messages: boundedMessages,
        stream: false,
        options: {
          num_predict: options?.num_predict ?? 96,
          temperature: options?.temperature ?? 0.2,
          top_p: options?.top_p ?? 0.9,
        },
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama chat failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data?.message?.content ?? "";
}

export function getOllamaConfig() {
  return {
    host: OLLAMA_HOST,
    chatModel: OLLAMA_CHAT_MODEL,
    embedModel: OLLAMA_EMBED_MODEL,
  };
}
