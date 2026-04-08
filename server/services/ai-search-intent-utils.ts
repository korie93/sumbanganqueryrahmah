import type { OllamaMessage } from "../ai-ollama";
import { extractJsonObject, parseIntentFallback } from "./ai-search-query-utils";
import type { AiIntent } from "./ai-search-types";

export async function resolveAiSearchIntent(params: {
  query: string;
  timeoutMs: number;
  withAiCircuit: <T>(operation: () => Promise<T>) => Promise<T>;
  ollamaChat: (messages: OllamaMessage[], options?: Record<string, unknown>) => Promise<string>;
  intentMode?: string | undefined;
}): Promise<AiIntent> {
  const intentMode = String(params.intentMode || "fast").toLowerCase();
  if (intentMode === "fast") {
    return parseIntentFallback(params.query);
  }

  const system =
    "Anda hanya keluarkan JSON SAHAJA. Tugas: kenalpasti intent carian dan entiti.\n" +
    "Format WAJIB:\n" +
    '{"intent":"search_person","entities":{"name":null,"ic":null,"account_no":null,"phone":null,"address":null},"need_nearest_branch":false}\n' +
    'Jika IC/MyKad ada, isi "ic". Jika akaun, isi "account_no". Jika nombor telefon, isi "phone".';

  const messages: OllamaMessage[] = [
    { role: "system", content: system },
    { role: "user", content: params.query },
  ];

  try {
    const raw = await params.withAiCircuit(() =>
      params.ollamaChat(messages, {
        num_predict: 160,
        temperature: 0.1,
        top_p: 0.9,
        timeoutMs: params.timeoutMs,
      }),
    );
    const parsed = extractJsonObject(raw);
    const entities = parsed?.entities;
    if (parsed && parsed.intent && entities && typeof entities === "object") {
      const entityRecord = entities as Record<string, unknown>;
      return {
        intent: String(parsed.intent || "search_person"),
        entities: {
          name: typeof entityRecord.name === "string" ? entityRecord.name : null,
          ic: typeof entityRecord.ic === "string" ? entityRecord.ic : null,
          account_no: typeof entityRecord.account_no === "string" ? entityRecord.account_no : null,
          phone: typeof entityRecord.phone === "string" ? entityRecord.phone : null,
          address: typeof entityRecord.address === "string" ? entityRecord.address : null,
        },
        need_nearest_branch: Boolean(parsed.need_nearest_branch),
      };
    }
  } catch {
    // fallback below
  }

  return parseIntentFallback(params.query);
}
