import { runtimeConfig } from "./config/runtime";

export type OllamaMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const OLLAMA_HOST = runtimeConfig.ai.host;
const OLLAMA_CHAT_MODEL = runtimeConfig.ai.chatModel;
const OLLAMA_EMBED_MODEL = runtimeConfig.ai.embedModel;
const MAX_OLLAMA_MESSAGES = 50;

type OllamaRequestOptions = {
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
};

function ensureText(input: string) {
  return (input || "").trim();
}

function resolveOllamaTimeoutMs(value: number | undefined) {
  const parsed = Number(value ?? runtimeConfig.ai.timeoutMs);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.trunc(parsed))
    : runtimeConfig.ai.timeoutMs;
}

function createOllamaHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (runtimeConfig.ai.authToken) {
    headers.Authorization = `Bearer ${runtimeConfig.ai.authToken}`;
  }
  return headers;
}

async function throwSanitizedOllamaHttpError(
  response: Response,
  operation: "chat" | "embeddings",
): Promise<never> {
  try {
    await response.text();
  } catch {
    // Drain best-effort only; raw provider bodies must never reach clients.
  }
  throw new Error(`Ollama ${operation} failed with HTTP ${response.status}.`);
}

function createOllamaAbortContext(timeoutMs: number, callerSignal?: AbortSignal) {
  const controller = new AbortController();
  let timeoutTriggered = false;
  let callerAbortTriggered = Boolean(callerSignal?.aborted);
  let timeoutHandle: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort();
  }, timeoutMs);
  timeoutHandle.unref?.();

  const handleCallerAbort = () => {
    callerAbortTriggered = true;
    controller.abort();
  };

  if (callerSignal?.aborted) {
    controller.abort();
  } else if (callerSignal) {
    callerSignal.addEventListener("abort", handleCallerAbort, { once: true });
  }

  return {
    cleanup: () => {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      callerSignal?.removeEventListener("abort", handleCallerAbort);
    },
    callerAborted: () => callerAbortTriggered,
    signal: controller.signal,
    timedOut: () => timeoutTriggered,
  };
}

function normalizeOllamaFetchError(
  error: unknown,
  operation: "chat" | "embeddings",
  abortContext: ReturnType<typeof createOllamaAbortContext>,
  timeoutMs: number,
): never {
  if (abortContext.timedOut()) {
    throw new Error(`Ollama ${operation} timed out after ${timeoutMs}ms.`);
  }

  if (abortContext.callerAborted()) {
    throw new Error(`Ollama ${operation} request cancelled.`);
  }

  throw error instanceof Error
    ? error
    : new Error(`Ollama ${operation} request failed.`);
}

export async function ollamaEmbed(input: string, options: OllamaRequestOptions = {}): Promise<number[]> {
  const prompt = ensureText(input);
  if (!prompt) return [];

  const timeoutMs = resolveOllamaTimeoutMs(options.timeoutMs);
  const abortContext = createOllamaAbortContext(timeoutMs, options.signal);
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: "POST",
      headers: createOllamaHeaders(),
      signal: abortContext.signal,
      body: JSON.stringify({
        model: OLLAMA_EMBED_MODEL,
        prompt,
      }),
    });
  } catch (error) {
    normalizeOllamaFetchError(error, "embeddings", abortContext, timeoutMs);
  } finally {
    abortContext.cleanup();
  }

  if (!res.ok) {
    await throwSanitizedOllamaHttpError(res, "embeddings");
  }

  const data = await res.json();
  return Array.isArray(data.embedding) ? data.embedding : [];
}

export async function ollamaChat(
  messages: OllamaMessage[],
  options?: OllamaRequestOptions & { num_predict?: number; temperature?: number; top_p?: number }
): Promise<string> {
  const timeoutMs = resolveOllamaTimeoutMs(options?.timeoutMs);
  const boundedMessages = Array.isArray(messages)
    ? messages.slice(Math.max(0, messages.length - MAX_OLLAMA_MESSAGES))
    : [];
  const abortContext = createOllamaAbortContext(timeoutMs, options?.signal);
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: createOllamaHeaders(),
      signal: abortContext.signal,
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
  } catch (error) {
    normalizeOllamaFetchError(error, "chat", abortContext, timeoutMs);
  } finally {
    abortContext.cleanup();
  }

  if (!res.ok) {
    await throwSanitizedOllamaHttpError(res, "chat");
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
