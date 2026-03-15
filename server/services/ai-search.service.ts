import type { OllamaMessage } from "../ai-ollama";
import { CircuitOpenError } from "../internal/circuitBreaker";
import {
  buildBranchSummary,
  buildExplanation,
  buildPersonSummary,
} from "./ai-search-explanation-utils";
import {
  buildFieldMatchSummary,
  ensureJsonRow,
  extractCustomerLocationHint,
  extractCustomerPostcode,
  extractJsonObject,
  extractLatLng,
  hasPostcodeCoord,
  isLatLng,
  isNonEmptyString,
  normalizeLocationHint,
  parseIntentFallback,
  rowScore,
  scoreRowDigits,
  tokenizeQuery,
  toObjectJson,
} from "./ai-search-query-utils";
import type {
  AiIntent,
  AiSearchResponse,
  AiSearchResult,
  AiSearchRuntimeSettings,
  AiSearchServiceOptions,
  LastAiPersonEntry,
  SearchCacheEntry,
} from "./ai-search-types";

export class AiSearchService {
  private readonly searchCache = new Map<string, SearchCacheEntry>();
  private readonly searchInflight = new Map<string, Promise<AiSearchResult>>();
  private readonly lastAiPerson = new Map<string, LastAiPersonEntry>();
  private readonly searchCacheMs = 60_000;
  private readonly searchFastTimeoutMs = 5500;
  private readonly maxSearchCacheEntries: number;
  private readonly maxLastAiPersonEntries: number;
  private readonly lastAiPersonTtlMs: number;

  constructor(private readonly options: AiSearchServiceOptions) {
    this.maxSearchCacheEntries = Number(
      process.env.SQR_MAX_SEARCH_CACHE_ENTRIES ?? (options.lowMemoryMode ? "60" : "180"),
    );
    this.maxLastAiPersonEntries = Number(
      process.env.SQR_MAX_AI_LAST_PERSON_ENTRIES ?? (options.lowMemoryMode ? "40" : "120"),
    );
    this.lastAiPersonTtlMs = Number(process.env.SQR_AI_LAST_PERSON_TTL_MS ?? "1800000");
    (global as any).__searchInflightMap = this.searchInflight;
  }

  sweepCaches(now = Date.now()) {
    for (const [key, entry] of this.searchCache.entries()) {
      if (now - entry.ts >= this.searchCacheMs) {
        this.searchCache.delete(key);
      }
    }
    this.trimCacheEntries(this.searchCache, Math.max(10, this.maxSearchCacheEntries));

    for (const [key, entry] of this.lastAiPerson.entries()) {
      if (now - entry.ts >= this.lastAiPersonTtlMs) {
        this.lastAiPerson.delete(key);
      }
    }
    this.trimCacheEntries(this.lastAiPerson, Math.max(10, this.maxLastAiPersonEntries));
  }

  clearSearchCache() {
    this.searchCache.clear();
  }

  async resolveSearchRequest(params: {
    query: string;
    userKey: string;
    runtimeSettings: AiSearchRuntimeSettings;
  }): Promise<AiSearchResponse> {
    const { query, userKey, runtimeSettings } = params;
    const cacheKey = `search:${query.toLowerCase()}`;
    const cached = this.searchCache.get(cacheKey);

    if (cached && Date.now() - cached.ts < this.searchCacheMs) {
      return {
        statusCode: 200,
        body: cached.payload,
        audit: cached.audit,
      };
    }

    if (cached) {
      this.searchCache.delete(cacheKey);
    }

    let inflight = this.searchInflight.get(cacheKey);
    if (!inflight) {
      inflight = this.options
        .withAiCircuit(() =>
          this.computeAiSearch(
            query,
            userKey,
            runtimeSettings.semanticSearchEnabled,
            runtimeSettings.aiTimeoutMs,
          ),
        )
        .then((result) => {
          this.searchCache.set(cacheKey, {
            ts: Date.now(),
            payload: result.payload,
            audit: result.audit,
          });
          this.trimCacheEntries(this.searchCache, Math.max(10, this.maxSearchCacheEntries));
          this.searchInflight.delete(cacheKey);
          return result;
        })
        .catch((error) => {
          this.searchInflight.delete(cacheKey);
          throw error;
        });

      this.searchInflight.set(cacheKey, inflight);
    }

    try {
      const configuredTimeout = runtimeSettings.aiTimeoutMs || this.searchFastTimeoutMs;
      const timeoutMs = Math.max(1000, Math.min(configuredTimeout, configuredTimeout - 1200));
      const result = await this.withTimeout(inflight, timeoutMs);
      return {
        statusCode: 200,
        body: result.payload,
        audit: result.audit,
      };
    } catch (error: any) {
      if (error instanceof CircuitOpenError) {
        return {
          statusCode: 503,
          body: {
            person: null,
            nearest_branch: null,
            decision: null,
            ai_explanation:
              "AI service is temporarily throttled for system stability. Please retry in a few seconds.",
            processing: false,
            circuit: "OPEN",
          },
        };
      }

      if (error?.message && error.message !== "timeout") {
        console.error("AI search compute failed:", error?.message || error);
      }

      return {
        statusCode: 200,
        body: {
          person: null,
          nearest_branch: null,
          decision: null,
          ai_explanation: "Sedang proses carian. Sila tunggu beberapa saat dan cuba semula.",
          processing: true,
        },
      };
    }
  }

  private async computeAiSearch(
    query: string,
    userKey: string,
    semanticSearchEnabled: boolean,
    aiTimeoutMs: number,
  ): Promise<AiSearchResult> {
    const intent = await this.parseIntent(query, aiTimeoutMs);
    const entities = intent.entities || {};

    const keywordTerms = [
      entities.ic,
      entities.account_no,
      entities.phone,
      entities.name,
    ].filter(Boolean) as string[];

    const keywordQuery = keywordTerms.length > 0 ? keywordTerms[0] : query;
    const digitsOnly = keywordQuery.replace(/[^0-9]/g, "");
    const hasDigitsQuery = digitsOnly.length >= 6;
    const keywordResults = hasDigitsQuery
      ? await this.options.storage.aiKeywordSearch({ query: keywordQuery, limit: 10 })
      : await this.options.storage.aiNameSearch({ query: keywordQuery, limit: 10 });
    const queryDigits = keywordQuery.replace(/[^0-9]/g, "");
    let fallbackDigitsResults: any[] = [];

    if (!hasDigitsQuery && keywordResults.length === 0 && queryDigits.length >= 6) {
      fallbackDigitsResults = await this.options.storage.aiDigitsSearch({
        digits: queryDigits,
        limit: 25,
      });
    }

    if (process.env.AI_DEBUG === "1") {
      console.log("AI_SEARCH DEBUG", {
        query,
        keywordQuery,
        queryDigits,
        keywordCount: keywordResults.length,
        fallbackDigitsCount: fallbackDigitsResults.length,
      });
    }

    let vectorResults: any[] = [];
    if (semanticSearchEnabled && !hasDigitsQuery) {
      try {
        const embedding = await this.options.withAiCircuit(() => this.options.ollamaEmbed(query));
        if (embedding.length > 0) {
          vectorResults = await this.options.storage.semanticSearch({ embedding, limit: 10 });
        }
      } catch {
        vectorResults = [];
      }
    }

    let best: any | null = null;
    let bestScore = 0;

    if (hasDigitsQuery) {
      const candidates = [...keywordResults, ...fallbackDigitsResults];
      for (const row of candidates) {
        const scored = scoreRowDigits(row, queryDigits);
        if (scored.score > bestScore) {
          bestScore = scored.score;
          row.jsonDataJsonb = scored.parsed;
          best = row;
        }
      }
    } else {
      const resultMap = new Map<string, any>();
      for (const row of keywordResults) {
        resultMap.set(row.rowId, row);
      }
      for (const row of fallbackDigitsResults) {
        resultMap.set(row.rowId, row);
      }
      for (const row of vectorResults) {
        resultMap.set(row.rowId, row);
      }

      const scored = Array.from(resultMap.values())
        .map((row) => {
          const normalized = ensureJsonRow(row);
          return {
            row: normalized,
            score: rowScore(
              normalized,
              entities.ic,
              entities.name,
              entities.account_no,
              entities.phone,
            ),
          };
        })
        .sort((a, b) => b.score - a.score);

      best = scored.length > 0 ? scored[0].row : null;
      bestScore = scored.length > 0 ? scored[0].score : 0;
    }

    if (process.env.AI_DEBUG === "1" && best) {
      const keys =
        best.jsonDataJsonb && typeof best.jsonDataJsonb === "object"
          ? Object.keys(best.jsonDataJsonb)
          : [];
      console.log("AI_SEARCH BEST ROW", {
        rowId: best.rowId,
        jsonType: typeof best.jsonDataJsonb,
        sampleKeys: keys.slice(0, 10),
      });
    }

    if (best) {
      this.lastAiPerson.set(userKey, { ts: Date.now(), row: best });
      this.trimCacheEntries(this.lastAiPerson, Math.max(10, this.maxLastAiPersonEntries));
    }

    const fallbackPerson = this.getLastAiPerson(userKey);
    const hasPersonId = Boolean(entities.ic || entities.account_no || entities.phone);
    const shouldFindBranch = intent.need_nearest_branch || hasPersonId;
    const branchTextPreferred = shouldFindBranch && !hasPersonId;
    const personForBranch = branchTextPreferred
      ? null
      : (best || (!hasPersonId ? fallbackPerson : null) || null);
    const branchTimeoutMs = Math.max(700, Math.min(2200, Math.floor(aiTimeoutMs * 0.35)));

    let nearestBranch: any | null = null;
    let missingCoords = false;
    let branchTextSearch = false;

    try {
      if (branchTextPreferred) {
        const locationHint = normalizeLocationHint(
          query.replace(/cawangan|branch|terdekat|nearest|lokasi|alamat|di|yang|paling|dekat/gi, " "),
        );
        if (locationHint.length >= 3) {
          branchTextSearch = true;
          const branches = await this.safeFindBranchesByText(locationHint, 3, branchTimeoutMs);
          nearestBranch = branches[0] || null;
        } else {
          branchTextSearch = true;
        }
      } else if (personForBranch && shouldFindBranch) {
        const coords = extractLatLng(personForBranch.jsonDataJsonb || {});
        if (isLatLng(coords)) {
          const branches = await this.safeNearestBranches(coords.lat, coords.lng, 1, branchTimeoutMs);
          nearestBranch = branches[0] || null;
        } else {
          let data = toObjectJson(personForBranch.jsonDataJsonb) || {};
          const basePostcode = extractCustomerPostcode(data);
          const baseHint = normalizeLocationHint(extractCustomerLocationHint(data));

          if (!basePostcode && baseHint.length < 3) {
            const locationCandidateRows = [best, ...keywordResults, ...fallbackDigitsResults];
            for (const candidate of locationCandidateRows) {
              const candidateData = toObjectJson(candidate?.jsonDataJsonb);
              if (!candidateData) continue;
              const candidatePostcode = extractCustomerPostcode(candidateData);
              const candidateHint = normalizeLocationHint(extractCustomerLocationHint(candidateData));
              if (candidatePostcode || candidateHint.length >= 3) {
                data = candidateData;
                break;
              }
            }
          }

          let postcodeWasProvided = false;
          const postcode = extractCustomerPostcode(data);
          if (postcode) {
            postcodeWasProvided = true;
            if (isNonEmptyString(postcode)) {
              const pc = await this.safePostcodeLatLng(postcode, branchTimeoutMs);
              if (hasPostcodeCoord(pc)) {
                const branches = await this.safeNearestBranches(pc.lat, pc.lng, 1, branchTimeoutMs);
                nearestBranch = branches[0] || null;
                if (process.env.AI_DEBUG === "1") {
                  console.log("AI_SEARCH POSTCODE_COORD", {
                    postcode,
                    lat: pc.lat,
                    lng: pc.lng,
                    branchCount: branches.length,
                  });
                }
              } else {
                let branches = await this.safeFindBranchesByPostcode(postcode, 1, branchTimeoutMs);
                if (!branches.length) {
                  try {
                    branches = await this.options.storage.findBranchesByPostcode({
                      postcode,
                      limit: 1,
                    });
                  } catch {
                    branches = [];
                  }
                }
                nearestBranch = branches[0] || null;
                if (process.env.AI_DEBUG === "1") {
                  console.log("AI_SEARCH POSTCODE_TEXT", {
                    postcode,
                    branchCount: branches.length,
                    branch: branches[0]?.name || null,
                  });
                }
                if (!nearestBranch) missingCoords = false;
              }
            } else {
              missingCoords = true;
            }
          } else {
            missingCoords = true;
          }

          if (!nearestBranch && missingCoords && !postcodeWasProvided) {
            const hint = normalizeLocationHint(extractCustomerLocationHint(data));
            if (hint.length >= 3) {
              branchTextSearch = true;
              const branches = await this.safeFindBranchesByText(hint, 1, branchTimeoutMs);
              nearestBranch = branches[0] ? { ...branches[0], distanceKm: undefined } : null;
            }
          }
        }
      }
    } catch {
      missingCoords = true;
      nearestBranch = null;
    }

    let decision: string | null = null;
    let travelMode: string | null = null;
    let estimatedMinutes: number | null = null;
    if (nearestBranch?.distanceKm !== undefined) {
      if (nearestBranch.distanceKm < 5) {
        decision = "WALK-IN";
        travelMode = "WALK";
        estimatedMinutes = Math.max(1, Math.round((nearestBranch.distanceKm / 5) * 60));
      } else if (nearestBranch.distanceKm < 20) {
        decision = "DRIVE";
        travelMode = "DRIVE";
        estimatedMinutes = Math.max(1, Math.round((nearestBranch.distanceKm / 40) * 60));
      } else {
        decision = "CALL";
      }

      if (decision === "CALL") {
        travelMode = "CALL";
        estimatedMinutes = null;
      }
    }

    const person = best
      ? {
          id: best.rowId,
          ...best.jsonDataJsonb,
        }
      : null;

    let suggestions: string[] = [];
    if ((!person || bestScore < 6) && !hasDigitsQuery) {
      const fuzzyResults = await this.options.storage.aiFuzzySearch({ query, limit: 5 });
      const tokens = tokenizeQuery(query);
      const maxScore = Math.max(1, tokens.length);
      suggestions = fuzzyResults
        .map((row) => {
          let data = row.jsonDataJsonb;
          if (typeof data === "string") {
            try {
              data = JSON.parse(data);
            } catch {
              data = {};
            }
          }
          if (!data || typeof data !== "object") data = {};

          const name = data["Nama"] || data["Customer Name"] || data["name"] || "-";
          const ic =
            data["No. MyKad"] || data["ID No"] || data["No Pengenalan"] || data["IC"] || "-";
          const addr =
            data["Alamat Surat Menyurat"] ||
            data["HomeAddress1"] ||
            data["Address"] ||
            data["Alamat"] ||
            "-";
          const confidence = Math.min(100, Math.round((Number(row.score || 0) / maxScore) * 100));
          const hasAny = [name, ic, addr].some((value) => value && value !== "-" && String(value).trim() !== "");
          return hasAny
            ? `- ${name} | IC: ${ic} | Alamat: ${addr} | Keyakinan: ${confidence}%`
            : "";
        })
        .filter(Boolean);
    }

    const personSummary = buildPersonSummary(person);
    const branchSummary = buildBranchSummary(nearestBranch);
    const explanation = buildExplanation({
      decision,
      distanceKm: nearestBranch?.distanceKm ?? null,
      branch: nearestBranch?.name ?? null,
      personSummary,
      branchSummary,
      estimatedMinutes,
      travelMode,
      missingCoords,
      suggestions,
      matchFields:
        !hasDigitsQuery && person && typeof person === "object"
          ? buildFieldMatchSummary(person, query)
          : [],
      branchTextSearch,
    });

    return {
      payload: {
        person,
        nearest_branch: nearestBranch
          ? {
              name: nearestBranch.name,
              address: nearestBranch.address,
              phone: nearestBranch.phone,
              fax: nearestBranch.fax,
              business_hour: nearestBranch.businessHour,
              day_open: nearestBranch.dayOpen,
              atm_cdm: nearestBranch.atmCdm,
              inquiry_availability: nearestBranch.inquiryAvailability,
              application_availability: nearestBranch.applicationAvailability,
              aeon_lounge: nearestBranch.aeonLounge,
              distance_km: nearestBranch.distanceKm,
              travel_mode: travelMode,
              estimated_minutes: estimatedMinutes,
            }
          : null,
        decision,
        ai_explanation: explanation,
      },
      audit: {
        query,
        intent,
        matched_profile_id: person?.id || null,
        branch: nearestBranch?.name || null,
        distance_km: nearestBranch?.distanceKm || null,
        decision,
        travel_mode: travelMode,
        estimated_minutes: estimatedMinutes,
        used_last_person: !best && !!fallbackPerson,
      },
    };
  }

  private getLastAiPerson(userKey: string): any | null {
    const entry = this.lastAiPerson.get(userKey);
    if (!entry) return null;
    if (Date.now() - entry.ts >= this.lastAiPersonTtlMs) {
      this.lastAiPerson.delete(userKey);
      return null;
    }
    return entry.row;
  }

  private async parseIntent(query: string, timeoutMs = this.options.defaultAiTimeoutMs): Promise<AiIntent> {
    const intentMode = String(process.env.AI_INTENT_MODE || "fast").toLowerCase();
    if (intentMode === "fast") {
      return parseIntentFallback(query);
    }

    const system =
      "Anda hanya keluarkan JSON SAHAJA. Tugas: kenalpasti intent carian dan entiti.\n" +
      "Format WAJIB:\n" +
      '{"intent":"search_person","entities":{"name":null,"ic":null,"account_no":null,"phone":null,"address":null},"need_nearest_branch":false}\n' +
      'Jika IC/MyKad ada, isi "ic". Jika akaun, isi "account_no". Jika nombor telefon, isi "phone".';

    const messages: OllamaMessage[] = [
      { role: "system", content: system },
      { role: "user", content: query },
    ];

    try {
      const raw = await this.options.withAiCircuit(() =>
        this.options.ollamaChat(messages, {
          num_predict: 160,
          temperature: 0.1,
          top_p: 0.9,
          timeoutMs,
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
            account_no:
              typeof entityRecord.account_no === "string" ? entityRecord.account_no : null,
            phone: typeof entityRecord.phone === "string" ? entityRecord.phone : null,
            address: typeof entityRecord.address === "string" ? entityRecord.address : null,
          },
          need_nearest_branch: Boolean(parsed.need_nearest_branch),
        };
      }
    } catch {
      // fallback below
    }

    return parseIntentFallback(query);
  }

  private async safeFindBranchesByText(text: string, limit: number, timeoutMs: number) {
    try {
      return await this.withTimeout(
        this.options.storage.findBranchesByText({ query: text, limit }),
        timeoutMs,
      );
    } catch {
      return [];
    }
  }

  private async safeFindBranchesByPostcode(postcode: string, limit: number, timeoutMs: number) {
    try {
      return await this.withTimeout(
        this.options.storage.findBranchesByPostcode({ postcode, limit }),
        timeoutMs,
      );
    } catch {
      return [];
    }
  }

  private async safeNearestBranches(lat: number, lng: number, limit: number, timeoutMs: number) {
    try {
      return await this.withTimeout(
        this.options.storage.getNearestBranches({ lat, lng, limit }),
        timeoutMs,
      );
    } catch {
      return [];
    }
  }

  private async safePostcodeLatLng(postcode: string, timeoutMs: number) {
    try {
      return await this.withTimeout(this.options.storage.getPostcodeLatLng(postcode), timeoutMs);
    } catch {
      return null;
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = setTimeout(() => reject(new Error("timeout")), ms);
      promise
        .then((value) => {
          clearTimeout(id);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(id);
          reject(error);
        });
    });
  }

  private trimCacheEntries<T extends { ts: number }>(cache: Map<string, T>, maxEntries: number) {
    if (cache.size <= maxEntries) return;
    const excess = cache.size - maxEntries;
    const keysByAge = Array.from(cache.entries())
      .sort((a, b) => a[1].ts - b[1].ts)
      .slice(0, excess)
      .map(([key]) => key);

    for (const key of keysByAge) {
      cache.delete(key);
    }
  }
}
