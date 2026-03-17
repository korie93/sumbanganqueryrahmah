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

export type AiIntentEntities = AiIntent["entities"];

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
  row: AiSearchCandidateRow;
};

export type AiSearchStorage = Pick<
  PostgresStorage,
  | "aiDigitsSearch"
  | "aiFuzzySearch"
  | "aiKeywordSearch"
  | "aiNameSearch"
  | "findBranchesByPostcode"
  | "findBranchesByText"
  | "getNearestBranches"
  | "getPostcodeLatLng"
  | "semanticSearch"
>;

export type AiSearchServiceOptions = {
  storage: AiSearchStorage;
  withAiCircuit: <T>(operation: () => Promise<T>) => Promise<T>;
  ollamaChat: (messages: OllamaMessage[], options?: Record<string, unknown>) => Promise<string>;
  ollamaEmbed: (text: string) => Promise<number[]>;
  defaultAiTimeoutMs: number;
  lowMemoryMode: boolean;
};

export type AiKeywordSearchRow = Awaited<ReturnType<PostgresStorage["aiKeywordSearch"]>>[number];
export type AiNameSearchRow = Awaited<ReturnType<PostgresStorage["aiNameSearch"]>>[number];
export type AiDigitsSearchRow = Awaited<ReturnType<PostgresStorage["aiDigitsSearch"]>>[number];
export type AiSemanticSearchRow = Awaited<ReturnType<PostgresStorage["semanticSearch"]>>[number];
export type AiFuzzySearchRow = Awaited<ReturnType<PostgresStorage["aiFuzzySearch"]>>[number];
export type AiBranchSearchResult = Awaited<ReturnType<PostgresStorage["findBranchesByText"]>>[number];
export type AiNearestBranchResult = Awaited<ReturnType<PostgresStorage["getNearestBranches"]>>[number];
export type AiPostcodeCoord = NonNullable<Awaited<ReturnType<PostgresStorage["getPostcodeLatLng"]>>>;

export type AiSearchCandidateRow =
  | AiKeywordSearchRow
  | AiNameSearchRow
  | AiDigitsSearchRow
  | AiSemanticSearchRow;
