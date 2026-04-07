import { PostgresActivityStorage } from "./postgres-activity-storage";

type CategoryRule = {
  key: string;
  terms: string[];
  fields: string[];
  matchMode?: string;
  enabled?: boolean;
};

export class PostgresAiStorage extends PostgresActivityStorage {
  async createConversation(createdBy: string): Promise<string> {
    return this.aiRepository.createConversation(createdBy);
  }

  async saveConversationMessage(
    conversationId: string,
    role: "user" | "assistant" | "system",
    content: string,
  ): Promise<void> {
    return this.aiRepository.saveConversationMessage(conversationId, role, content);
  }

  async getConversationMessages(
    conversationId: string,
    limit: number = 20,
  ): Promise<Array<{ role: string; content: string }>> {
    return this.aiRepository.getConversationMessages(conversationId, limit);
  }

  async saveEmbedding(params: {
    importId: string;
    rowId: string;
    content: string;
    embedding: number[];
  }): Promise<void> {
    return this.aiRepository.saveEmbedding(params);
  }

  async semanticSearch(params: {
    embedding: number[];
    limit: number;
    importId?: string | null;
  }): Promise<
    Array<{
      rowId: string;
      importId: string;
      content: string;
      score: number;
      importName: string | null;
      importFilename: string | null;
      jsonDataJsonb: unknown;
    }>
  > {
    return this.aiRepository.semanticSearch(params);
  }

  async aiKeywordSearch(params: { query: string; limit: number }): Promise<
    Array<{
      rowId: string;
      importId: string;
      importName: string | null;
      importFilename: string | null;
      jsonDataJsonb: unknown;
    }>
  > {
    return this.aiRepository.aiKeywordSearch(params);
  }

  async aiNameSearch(params: { query: string; limit: number }): Promise<
    Array<{
      rowId: string;
      importId: string;
      importName: string | null;
      importFilename: string | null;
      jsonDataJsonb: unknown;
    }>
  > {
    return this.aiRepository.aiNameSearch(params);
  }

  async aiDigitsSearch(params: { digits: string; limit: number }): Promise<
    Array<{
      rowId: string;
      importId: string;
      importName: string | null;
      importFilename: string | null;
      jsonDataJsonb: unknown;
    }>
  > {
    return this.aiRepository.aiDigitsSearch(params);
  }

  async aiFuzzySearch(params: { query: string; limit: number }): Promise<
    Array<{
      rowId: string;
      importId: string;
      importName: string | null;
      importFilename: string | null;
      jsonDataJsonb: unknown;
      score: number;
    }>
  > {
    return this.aiRepository.aiFuzzySearch(params);
  }

  async findBranchesByText(params: { query: string; limit: number }): Promise<
    Array<{
      name: string;
      address: string | null;
      phone: string | null;
      fax: string | null;
      businessHour: string | null;
      dayOpen: string | null;
      atmCdm: string | null;
      inquiryAvailability: string | null;
      applicationAvailability: string | null;
      aeonLounge: string | null;
    }>
  > {
    return this.aiRepository.findBranchesByText(params);
  }

  async findBranchesByPostcode(params: { postcode: string; limit: number }): Promise<
    Array<{
      name: string;
      address: string | null;
      phone: string | null;
      fax: string | null;
      businessHour: string | null;
      dayOpen: string | null;
      atmCdm: string | null;
      inquiryAvailability: string | null;
      applicationAvailability: string | null;
      aeonLounge: string | null;
    }>
  > {
    return this.aiRepository.findBranchesByPostcode(params);
  }

  async countRowsByKeywords(params: { groups: Array<CategoryRule> }): Promise<{
    totalRows: number;
    counts: Record<string, number>;
  }> {
    return this.aiCategoryRepository.countRowsByKeywords(params);
  }

  async getCategoryRules(): Promise<
    Array<{
      key: string;
      terms: string[];
      fields: string[];
      matchMode: string;
      enabled: boolean;
    }>
  > {
    return this.aiCategoryRepository.getCategoryRules();
  }

  async getCategoryRulesMaxUpdatedAt(): Promise<Date | null> {
    return this.aiCategoryRepository.getCategoryRulesMaxUpdatedAt();
  }

  async getCategoryStats(keys: string[]): Promise<
    Array<{
      key: string;
      total: number;
      samples: Array<{ name: string; ic: string; source: string | null }>;
      updatedAt: Date | null;
    }>
  > {
    return this.aiCategoryRepository.getCategoryStats(keys);
  }

  async computeCategoryStatsForKeys(keys: string[], groups: Array<CategoryRule>): Promise<
    Array<{
      key: string;
      total: number;
      samples: Array<{ name: string; ic: string; source: string | null }>;
      updatedAt: Date | null;
    }>
  > {
    return this.aiCategoryRepository.computeCategoryStatsForKeys(keys, groups);
  }

  async rebuildCategoryStats(groups: Array<CategoryRule>): Promise<void> {
    return this.aiCategoryRepository.rebuildCategoryStats(groups);
  }

  async getNearestBranches(params: { lat: number; lng: number; limit?: number }): Promise<
    Array<{
      name: string;
      address: string | null;
      phone: string | null;
      fax: string | null;
      businessHour: string | null;
      dayOpen: string | null;
      atmCdm: string | null;
      inquiryAvailability: string | null;
      applicationAvailability: string | null;
      aeonLounge: string | null;
      distanceKm: number;
    }>
  > {
    return this.aiRepository.getNearestBranches(params);
  }

  async getPostcodeLatLng(postcode: string): Promise<{ lat: number; lng: number } | null> {
    return this.aiRepository.getPostcodeLatLng(postcode);
  }

  async importBranchesFromRows(params: {
    importId: string;
    nameKey?: string | null;
    latKey?: string | null;
    lngKey?: string | null;
  }): Promise<{
    inserted: number;
    skipped: number;
    usedKeys: { nameKey: string; latKey: string; lngKey: string };
  }> {
    return this.aiRepository.importBranchesFromRows(params);
  }

  async getDataRowsForEmbedding(
    importId: string,
    limit: number,
    offset: number,
  ): Promise<Array<{ id: string; jsonDataJsonb: unknown }>> {
    return this.aiRepository.getDataRowsForEmbedding(importId, limit, offset);
  }
}
