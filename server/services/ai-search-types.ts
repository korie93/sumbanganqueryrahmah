import type { OllamaMessage } from "../ai-ollama";
import type { PostgresStorage } from "../storage-postgres";

export type AiIntent = {
  intent: string;
  entities: {
    name?: string | null;
    ic?: string | null;
    account_no?: string | null;
    phone?: string | null;
    address?: string | null;
    count_groups?: string[] | null;
  };
  need_nearest_branch: boolean;
};

export type AiSearchAudit = {
  query: string;
  intent: AiIntent;
  matched_profile_id: string | null;
  branch: string | null;
  distance_km: number | null;
  decision: string | null;
  travel_mode: string | null;
  estimated_minutes: number | null;
  used_last_person: boolean;
};

export type AiSearchResult = {
  payload: unknown;
  audit: AiSearchAudit;
};

export type AiSearchResponse = {
  statusCode: number;
  body: unknown;
  audit?: AiSearchAudit;
};

export type AiSearchRuntimeSettings = {
  semanticSearchEnabled: boolean;
  aiTimeoutMs: number;
};

export type SearchCacheEntry = {
  ts: number;
  payload: unknown;
  audit: AiSearchAudit;
};

export type LastAiPersonEntry = {
  ts: number;
  row: unknown;
};

export type AiSearchServiceOptions = {
  storage: PostgresStorage;
  withAiCircuit: <T>(operation: () => Promise<T>) => Promise<T>;
  ollamaChat: (messages: OllamaMessage[], options?: Record<string, unknown>) => Promise<string>;
  ollamaEmbed: (text: string) => Promise<number[]>;
  defaultAiTimeoutMs: number;
  lowMemoryMode: boolean;
};
