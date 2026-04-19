import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { ensureObject, readBoundedPageSize, readPositivePage } from "../http/validation";
import type { SearchService } from "../services/search.service";

type RuntimeSettings = {
  searchResultLimit: number;
};

type CreateSearchControllerDeps = {
  searchService: SearchService;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  isDbProtected: () => boolean;
};

export type SearchController = ReturnType<typeof createSearchController>;
const SEARCH_MAX_PAGE_SIZE = 100;

function clampSearchPageSize(value: unknown) {
  return readBoundedPageSize(value, 50, SEARCH_MAX_PAGE_SIZE);
}

export function createSearchController(deps: CreateSearchControllerDeps) {
  const {
    searchService,
    getRuntimeSettingsCached,
    isDbProtected,
  } = deps;

  const getColumns = async (_req: AuthenticatedRequest, res: Response) => {
    return res.json(await searchService.getColumns());
  };

  const searchGlobal = async (req: AuthenticatedRequest, res: Response) => {
    const search = String(req.query.q || "").trim();
    const runtimeSettings = await getRuntimeSettingsCached();
    const page = readPositivePage(req.query.page, 1);
    const requestedLimit = clampSearchPageSize(req.query.pageSize ?? req.query.limit);

    return res.json(await searchService.searchGlobal({
      search,
      page,
      requestedLimit,
      maxTotal: runtimeSettings.searchResultLimit,
      isDbProtected: isDbProtected(),
    }));
  };

  const searchSimple = async (req: AuthenticatedRequest, res: Response) => {
    return res.json(await searchService.searchSimple(String(req.query.q || "")));
  };

  const advancedSearch = async (req: AuthenticatedRequest, res: Response) => {
    const body = ensureObject(req.body) || {};
    const filters = Array.isArray(body.filters) ? body.filters : [];
    const logic = body.logic === "OR" ? "OR" : "AND";
    const runtimeSettings = await getRuntimeSettingsCached();
    const page = readPositivePage(body.page, 1);
    const requestedLimit = clampSearchPageSize(body.pageSize ?? body.limit);

    return res.json(await searchService.advancedSearch({
      filters,
      logic,
      page,
      requestedLimit,
      maxTotal: runtimeSettings.searchResultLimit,
    }));
  };

  return {
    getColumns,
    searchGlobal,
    searchSimple,
    advancedSearch,
  };
}
