import {
  findBranchesByPostcodeRows,
  findBranchesByTextRows,
  getNearestBranchesRows,
  getPostcodeLatLngValue,
} from "./ai-branch-lookup-utils";
import {
  assertAiConversationOwner,
  createAiConversation,
  getAiConversationMessages,
  saveAiConversationMessage,
} from "./ai-repository-conversation-utils";
import { importAiBranchesFromRows } from "./ai-repository-branch-import-utils";
import { getAiDataRowsForEmbedding } from "./ai-repository-data-row-utils";
import {
  aiDigitsSearchRows,
  aiFuzzySearchRows,
  aiKeywordSearchRows,
  aiNameSearchRows,
  saveAiEmbeddingRow,
  semanticSearchRows,
} from "./ai-search-record-utils";
import type {
  AiBranchImportParams,
  AiBranchImportResult,
  AiConversationMessage,
  AiEmbeddingSourceRow,
  AiFuzzySearchRow,
  AiRepositoryOptions,
  AiSearchRecordRow,
  AiSemanticSearchRow,
  BranchSearchResult,
} from "./ai-repository-types";

export class AiRepository {
  constructor(private readonly options: AiRepositoryOptions) {}

  async createConversation(ownerUserId: string): Promise<string> {
    return createAiConversation(ownerUserId);
  }

  async assertConversationOwner(conversationId: string, ownerUserId: string): Promise<void> {
    return assertAiConversationOwner(conversationId, ownerUserId);
  }

  async saveConversationMessage(
    conversationId: string,
    ownerUserId: string,
    role: "user" | "assistant" | "system",
    content: string,
  ): Promise<void> {
    return saveAiConversationMessage(conversationId, ownerUserId, role, content);
  }

  async getConversationMessages(
    conversationId: string,
    ownerUserId: string,
    limit = 20,
  ): Promise<AiConversationMessage[]> {
    return getAiConversationMessages(conversationId, ownerUserId, limit);
  }

  async saveEmbedding(params: {
    importId: string;
    rowId: string;
    content: string;
    embedding: number[];
  }): Promise<void> {
    return saveAiEmbeddingRow(params);
  }

  async semanticSearch(params: {
    embedding: number[];
    limit: number;
    importId?: string | null;
  }): Promise<AiSemanticSearchRow[]> {
    return semanticSearchRows(params);
  }

  async aiKeywordSearch(params: {
    query: string;
    limit: number;
  }): Promise<AiSearchRecordRow[]> {
    return aiKeywordSearchRows(params);
  }

  async aiNameSearch(params: {
    query: string;
    limit: number;
  }): Promise<AiSearchRecordRow[]> {
    return aiNameSearchRows(params);
  }

  async aiDigitsSearch(params: {
    digits: string;
    limit: number;
  }): Promise<AiSearchRecordRow[]> {
    return aiDigitsSearchRows(params);
  }

  async aiFuzzySearch(params: {
    query: string;
    limit: number;
  }): Promise<AiFuzzySearchRow[]> {
    return aiFuzzySearchRows(params);
  }

  async findBranchesByText(params: { query: string; limit: number }): Promise<BranchSearchResult[]> {
    return findBranchesByTextRows(params);
  }

  async findBranchesByPostcode(params: { postcode: string; limit: number }): Promise<BranchSearchResult[]> {
    return findBranchesByPostcodeRows({
      ...params,
      ensureSpatialTables: this.options.ensureSpatialTables,
    });
  }

  async getNearestBranches(
    params: { lat: number; lng: number; limit?: number },
  ): Promise<Array<BranchSearchResult & { distanceKm: number }>> {
    return getNearestBranchesRows(params);
  }

  async getPostcodeLatLng(postcode: string): Promise<{ lat: number; lng: number } | null> {
    return getPostcodeLatLngValue({
      postcode,
      ensureSpatialTables: this.options.ensureSpatialTables,
    });
  }

  async importBranchesFromRows(params: AiBranchImportParams): Promise<AiBranchImportResult> {
    return importAiBranchesFromRows({
      ...params,
      ensureSpatialTables: this.options.ensureSpatialTables,
    });
  }

  async getDataRowsForEmbedding(
    importId: string,
    limit: number,
    offset: number,
  ): Promise<AiEmbeddingSourceRow[]> {
    return getAiDataRowsForEmbedding(importId, limit, offset);
  }
}
