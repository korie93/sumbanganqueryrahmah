import type { OllamaMessage } from "../ai-ollama";
import { CircuitOpenError } from "../internal/circuitBreaker";
import type { PostgresStorage } from "../storage-postgres";

type AiIntent = {
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

type AiSearchAudit = {
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

type AiSearchResult = {
  payload: any;
  audit: AiSearchAudit;
};

type AiSearchResponse = {
  statusCode: number;
  body: any;
  audit?: AiSearchAudit;
};

type AiSearchRuntimeSettings = {
  semanticSearchEnabled: boolean;
  aiTimeoutMs: number;
};

type SearchCacheEntry = {
  ts: number;
  payload: any;
  audit: AiSearchAudit;
};

type LastAiPersonEntry = {
  ts: number;
  row: any;
};

type AiSearchServiceOptions = {
  storage: PostgresStorage;
  withAiCircuit: <T>(operation: () => Promise<T>) => Promise<T>;
  ollamaChat: (messages: OllamaMessage[], options?: Record<string, unknown>) => Promise<string>;
  ollamaEmbed: (text: string) => Promise<number[]>;
  defaultAiTimeoutMs: number;
  lowMemoryMode: boolean;
};

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
        const scored = this.scoreRowDigits(row, queryDigits);
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
          const normalized = this.ensureJson(row);
          return {
            row: normalized,
            score: this.rowScore(
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
        const locationHint = this.normalizeLocationHint(
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
        const coords = this.extractLatLng(personForBranch.jsonDataJsonb || {});
        if (this.isLatLng(coords)) {
          const branches = await this.safeNearestBranches(coords.lat, coords.lng, 1, branchTimeoutMs);
          nearestBranch = branches[0] || null;
        } else {
          let data = this.toObjectJson(personForBranch.jsonDataJsonb) || {};
          const basePostcode = this.extractCustomerPostcode(data);
          const baseHint = this.normalizeLocationHint(this.extractCustomerLocationHint(data));

          if (!basePostcode && baseHint.length < 3) {
            const locationCandidateRows = [best, ...keywordResults, ...fallbackDigitsResults];
            for (const candidate of locationCandidateRows) {
              const candidateData = this.toObjectJson((candidate as any)?.jsonDataJsonb);
              if (!candidateData) continue;
              const candidatePostcode = this.extractCustomerPostcode(candidateData);
              const candidateHint = this.normalizeLocationHint(
                this.extractCustomerLocationHint(candidateData),
              );
              if (candidatePostcode || candidateHint.length >= 3) {
                data = candidateData;
                break;
              }
            }
          }

          let postcodeWasProvided = false;
          const postcode = this.extractCustomerPostcode(data);
          if (postcode) {
            postcodeWasProvided = true;
            if (this.isNonEmptyString(postcode)) {
              const pc = await this.safePostcodeLatLng(postcode, branchTimeoutMs);
              if (this.hasPostcodeCoord(pc)) {
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
            const hint = this.normalizeLocationHint(this.extractCustomerLocationHint(data));
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
      const tokens = this.tokenizeQuery(query);
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

    const personSummary = this.buildPersonSummary(person);
    const branchSummary = this.buildBranchSummary(nearestBranch);
    const explanation = this.buildExplanation({
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
          ? this.buildFieldMatchSummary(person, query)
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

  private buildPersonSummary(person: Record<string, any> | null) {
    const summary: Array<{ label: string; value: string }> = [];
    if (person && typeof person === "object") {
      const pushIf = (label: string, key: string) => {
        const value = person[key];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          summary.push({ label, value: String(value) });
        }
      };

      pushIf("Nama", "Nama");
      pushIf("Nama", "Customer Name");
      pushIf("Nama", "name");
      pushIf("No. MyKad", "No. MyKad");
      pushIf("ID No", "ID No");
      pushIf("No Pengenalan", "No Pengenalan");
      pushIf("IC", "ic");
      pushIf("Account No", "Account No");
      pushIf("Card No", "Card No");
      pushIf("No. Telefon Rumah", "No. Telefon Rumah");
      pushIf("No. Telefon Bimbit", "No. Telefon Bimbit");
      pushIf("Handphone", "Handphone");
      pushIf("OfficePhone", "OfficePhone");
      pushIf("Alamat Surat Menyurat", "Alamat Surat Menyurat");
      pushIf("HomeAddress1", "HomeAddress1");
      pushIf("HomeAddress2", "HomeAddress2");
      pushIf("HomeAddress3", "HomeAddress3");
      pushIf("HomePostcode", "HomePostcode");
      pushIf("Home Post Code", "Home Post Code");
      pushIf("Home Postal Code", "Home Postal Code");
      pushIf("Bandar", "Bandar");
      pushIf("Negeri", "Negeri");
      pushIf("Poskod", "Poskod");
    }

    if (summary.length === 0 && person && typeof person === "object") {
      const entries = Object.entries(person).filter(([key]) => key !== "id").slice(0, 8);
      for (const [key, value] of entries) {
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          summary.push({ label: key, value: String(value) });
        }
      }
    }

    return summary;
  }

  private buildBranchSummary(nearestBranch: any | null) {
    const summary: Array<{ label: string; value: string }> = [];
    if (!nearestBranch) {
      return summary;
    }

    const push = (label: string, value: any) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        summary.push({ label, value: String(value) });
      }
    };

    push("Nama Cawangan", nearestBranch.name);
    push("Alamat", nearestBranch.address);
    push("Telefon", nearestBranch.phone);
    push("Fax", nearestBranch.fax);
    push("Business Hour", nearestBranch.businessHour);
    push("Day Open", nearestBranch.dayOpen);
    push("ATM & CDM", nearestBranch.atmCdm);
    push("Inquiry Availability", nearestBranch.inquiryAvailability);
    push("Application Availability", nearestBranch.applicationAvailability);
    push("AEON Lounge", nearestBranch.aeonLounge);
    push("Jarak (KM)", nearestBranch.distanceKm);
    return summary;
  }

  private buildExplanation(payload: {
    decision: string | null;
    distanceKm: number | null;
    branch: string | null;
    personSummary: Array<{ label: string; value: string }>;
    branchSummary: Array<{ label: string; value: string }>;
    estimatedMinutes: number | null;
    travelMode: string | null;
    missingCoords: boolean;
    suggestions?: string[];
    matchFields?: string[];
    branchTextSearch?: boolean;
  }): string {
    const personLines =
      payload.personSummary.length > 0
        ? payload.personSummary.map((item) => `${item.label}: ${item.value}`).join("\n")
        : "Tiada maklumat pelanggan dijumpai.";
    const branchLines =
      payload.branchSummary.length > 0
        ? payload.branchSummary.map((item) => `${item.label}: ${item.value}`).join("\n")
        : payload.missingCoords
          ? "Lokasi pelanggan tidak lengkap (tiada LAT/LNG atau Postcode)."
          : payload.branchTextSearch
            ? "Tiada padanan cawangan ditemui berdasarkan lokasi/teks."
            : "Tiada maklumat cawangan dijumpai.";

    let decisionLine = "Tiada cadangan dibuat.";
    if (payload.decision) {
      const timeInfo = payload.estimatedMinutes
        ? ` Anggaran masa ${payload.estimatedMinutes} minit.`
        : "";
      const modeInfo = payload.travelMode ? ` Mod: ${payload.travelMode}.` : "";
      if (payload.distanceKm && payload.branch) {
        decisionLine = `Cadangan: ${payload.decision}. Jarak ke ${payload.branch} adalah ${payload.distanceKm.toFixed(1)}KM.${timeInfo}${modeInfo}`;
      } else {
        decisionLine = `Cadangan: ${payload.decision}.${timeInfo}${modeInfo}`;
      }
    } else if (payload.branchSummary.length > 0) {
      decisionLine = "Cadangan: Sila hubungi/kunjungi cawangan di atas.";
    }

    const base = [
      "Maklumat Pelanggan:",
      personLines,
      "",
      "Cadangan Cawangan Terdekat:",
      branchLines,
      "",
      decisionLine,
    ];

    if (payload.matchFields && payload.matchFields.length > 0) {
      base.push("", "Padanan Medan (Top):", payload.matchFields.join("\n"));
    }

    if (payload.suggestions && payload.suggestions.length > 0) {
      base.push("", "Cadangan Rekod (fuzzy):", payload.suggestions.join("\n"));
    }

    return base.join("\n");
  }

  private async parseIntent(query: string, timeoutMs = this.options.defaultAiTimeoutMs): Promise<AiIntent> {
    const intentMode = String(process.env.AI_INTENT_MODE || "fast").toLowerCase();
    if (intentMode === "fast") {
      return this.parseIntentFallback(query);
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
      const parsed = this.extractJsonObject(raw);
      if (parsed && parsed.intent && parsed.entities) {
        return {
          intent: String(parsed.intent || "search_person"),
          entities: {
            name: parsed.entities?.name ?? null,
            ic: parsed.entities?.ic ?? null,
            account_no: parsed.entities?.account_no ?? null,
            phone: parsed.entities?.phone ?? null,
            address: parsed.entities?.address ?? null,
          },
          need_nearest_branch: Boolean(parsed.need_nearest_branch),
        };
      }
    } catch {
      // fallback below
    }

    return this.parseIntentFallback(query);
  }

  private parseIntentFallback(query: string): AiIntent {
    const digits = query.match(/\d{6,}/g) || [];
    const ic = digits.find((value) => value.length === 12) || null;
    const account = digits.find((value) => value.length >= 10 && value.length <= 16) || null;
    const phone = digits.find((value) => value.length >= 9 && value.length <= 11) || null;
    const needBranch = /cawangan|branch|terdekat|nearest|lokasi|alamat/i.test(query);
    const name = needBranch ? null : (ic ? null : query.trim());

    return {
      intent: "search_person",
      entities: {
        name,
        ic,
        account_no: account,
        phone,
        address: null,
        count_groups: null,
      },
      need_nearest_branch: needBranch,
    };
  }

  private extractJsonObject(text: string): any | null {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) {
      return null;
    }

    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {
      return null;
    }
  }

  private tokenizeQuery(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]/gi, ""))
      .filter((token) => token.length >= 3);
  }

  private buildFieldMatchSummary(data: Record<string, any>, query: string): string[] {
    const tokens = this.tokenizeQuery(query);
    if (tokens.length === 0) {
      return [];
    }

    const matches: Array<{ key: string; value: string; score: number }> = [];
    for (const [key, value] of Object.entries(data || {}).slice(0, 80)) {
      if (key === "id") continue;
      const valueStr = String(value ?? "");
      const valueLower = valueStr.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (valueLower.includes(token)) score += 1;
      }
      if (score > 0) {
        matches.push({ key, value: valueStr, score });
      }
    }

    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((match) => `${match.key}: ${match.value}`);
  }

  private rowScore(
    row: any,
    ic?: string | null,
    name?: string | null,
    account?: string | null,
    phone?: string | null,
  ): number {
    const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
    let score = 0;
    const icDigits = ic ? ic.replace(/\D/g, "") : "";
    const accountDigits = account ? account.replace(/\D/g, "") : "";
    const phoneDigits = phone ? phone.replace(/\D/g, "") : "";

    for (const [key, value] of Object.entries(data).slice(0, 80)) {
      const keyLower = key.toLowerCase();
      const valueStr = String(value ?? "");
      const valueDigits = valueStr.replace(/\D/g, "");

      if (icDigits && valueDigits === icDigits) {
        score +=
          keyLower.includes("ic") ||
          keyLower.includes("mykad") ||
          keyLower.includes("nric") ||
          keyLower.includes("kp") ||
          keyLower.includes("id no") ||
          keyLower.includes("idno")
            ? 20
            : 10;
      }
      if (accountDigits && valueDigits === accountDigits) {
        score += keyLower.includes("akaun") || keyLower.includes("account") ? 12 : 6;
      }
      if (phoneDigits && valueDigits === phoneDigits) {
        score +=
          keyLower.includes("telefon") || keyLower.includes("phone") || keyLower.includes("hp")
            ? 8
            : 4;
      }
      if (name && valueStr.toLowerCase().includes(name.toLowerCase())) {
        score += keyLower.includes("nama") || keyLower.includes("name") ? 6 : 2;
      }
    }

    return score;
  }

  private scoreRowDigits(row: any, digits: string): { score: number; parsed: any } {
    let data = row?.jsonDataJsonb;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        data = {};
      }
    }
    if (!data || typeof data !== "object") {
      data = {};
    }

    const keyGroups: Array<{ keys: string[]; score: number }> = [
      { keys: ["No. MyKad", "ID No", "No Pengenalan", "IC", "NRIC", "MyKad"], score: 20 },
      {
        keys: [
          "Account No",
          "Account Number",
          "Card No",
          "No Akaun",
          "Nombor Akaun Bank Pemohon",
        ],
        score: 12,
      },
      {
        keys: ["No. Telefon Rumah", "No. Telefon Bimbit", "Phone", "Handphone", "OfficePhone"],
        score: 8,
      },
    ];

    let best = 0;
    for (const group of keyGroups) {
      for (const key of group.keys) {
        const value = (data as any)[key];
        if (!value) continue;
        if (String(value).replace(/\D/g, "") === digits) {
          best = Math.max(best, group.score);
        }
      }
    }

    return { score: best, parsed: data };
  }

  private ensureJson(row: any) {
    if (row?.jsonDataJsonb && typeof row.jsonDataJsonb === "string") {
      try {
        row.jsonDataJsonb = JSON.parse(row.jsonDataJsonb);
      } catch {
        // keep as string
      }
    }
    return row;
  }

  private extractLatLng(data: Record<string, any>): { lat: number; lng: number } | null {
    const keys = Object.keys(data);
    const findValue = (names: string[]) => {
      const key = keys.find((candidate) => names.includes(candidate.toLowerCase()));
      if (!key) return null;
      const value = Number(String(data[key]).replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(value) ? value : null;
    };

    const lat = findValue(["lat", "latitude", "latitud"]);
    const lng = findValue(["lng", "long", "longitude", "longitud"]);
    if (lat === null || lng === null) {
      return null;
    }

    return { lat, lng };
  }

  private isLatLng(value: unknown): value is { lat: number; lng: number } {
    if (!value || typeof value !== "object") return false;
    const candidate = value as { lat?: unknown; lng?: unknown };
    return (
      typeof candidate.lat === "number" &&
      Number.isFinite(candidate.lat) &&
      typeof candidate.lng === "number" &&
      Number.isFinite(candidate.lng)
    );
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }

  private hasPostcodeCoord(value: unknown): value is { lat: number; lng: number } {
    return this.isLatLng(value);
  }

  private extractCustomerPostcode(data: Record<string, any>): string | null {
    if (!data || typeof data !== "object") return null;
    const entries = Object.entries(data);
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const relationWords = [
      "pasangan",
      "wakil",
      "hubungan",
      "spouse",
      "guardian",
      "emergency",
      "waris",
      "ibu",
      "bapa",
      "suami",
      "isteri",
    ];
    const relationWordsNorm = relationWords.map(normalize);

    const extractDigits = (value: unknown): string | null => {
      if (value === undefined || value === null) return null;
      const raw = String(value);
      const five = raw.match(/\b\d{5}\b/);
      if (five) return five[0];
      const four = raw.match(/\b\d{4}\b/);
      if (four) return `0${four[0]}`;
      return null;
    };

    const isRelationKey = (normalizedKey: string): boolean => {
      return relationWordsNorm.some((word) => normalizedKey.includes(word));
    };

    const pickByKey = (
      matcher: (normalizedKey: string, rawKey: string) => boolean,
      valueMatcher?: (normalizedKey: string, rawValue: unknown) => boolean,
    ): string | null => {
      for (const [rawKey, rawValue] of entries) {
        const keyNorm = normalize(rawKey);
        if (!matcher(keyNorm, rawKey)) continue;
        if (valueMatcher && !valueMatcher(keyNorm, rawValue)) continue;
        const postcode = extractDigits(rawValue);
        if (postcode) return postcode;
      }
      return null;
    };

    const homePostcode = pickByKey(
      (key) =>
        !isRelationKey(key) &&
        key.includes("home") &&
        (key.includes("postcode") || key.includes("postalcode") || key.includes("poskod")),
    );
    if (homePostcode) return homePostcode;

    const genericPostcode = pickByKey((key) => {
      const isGenericPostcode =
        key === "poskod" ||
        key === "postcode" ||
        key === "postalcode" ||
        key.endsWith("postcode") ||
        key.endsWith("poskod");
      if (!isGenericPostcode) return false;
      if (/[23]$/.test(key)) return false;
      if (key.includes("office")) return false;
      if (isRelationKey(key)) return false;
      return true;
    });
    if (genericPostcode) return genericPostcode;

    return pickByKey(
      (key) => {
        if (isRelationKey(key)) return false;
        if (key.includes("office")) return false;
        return (
          key.includes("homeaddress") ||
          key.includes("alamatsuratmenyurat") ||
          key === "address" ||
          key.includes("alamat")
        );
      },
      (_key, rawValue) => this.isNonEmptyString(rawValue),
    );
  }

  private extractCustomerLocationHint(data: Record<string, any>): string {
    if (!data || typeof data !== "object") return "";
    const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const relationWords = [
      "pasangan",
      "wakil",
      "hubungan",
      "spouse",
      "guardian",
      "waris",
      "ibu",
      "bapa",
      "suami",
      "isteri",
    ];
    const relationWordsNorm = relationWords.map(normalizeKey);
    const isRelationKey = (key: string) => relationWordsNorm.some((word) => key.includes(word));

    const parts: string[] = [];
    for (const [rawKey, rawValue] of Object.entries(data)) {
      if (!this.isNonEmptyString(rawValue)) continue;
      const key = normalizeKey(rawKey);
      if (isRelationKey(key)) continue;
      if (key.includes("office")) continue;

      const isLocationField =
        key.includes("homeaddress") ||
        key.includes("alamatsuratmenyurat") ||
        key === "address" ||
        key.includes("alamat") ||
        key === "bandar" ||
        key === "city" ||
        key.includes("citytown") ||
        key === "negeri" ||
        key === "state" ||
        key.includes("postcode") ||
        key.includes("poskod");

      if (!isLocationField) continue;
      const value = String(rawValue).trim();
      if (value) {
        parts.push(value);
      }
    }

    return Array.from(new Set(parts)).join(" ");
  }

  private normalizeLocationHint(value: string) {
    return value.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
  }

  private toObjectJson(value: unknown): Record<string, any> | null {
    if (!value) return null;
    if (typeof value === "object") return value as Record<string, any>;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : null;
      } catch {
        return null;
      }
    }
    return null;
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
