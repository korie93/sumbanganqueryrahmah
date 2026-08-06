import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { ensureObject, readInteger, readPageLimit } from "../http/validation";
import type { SearchService } from "../services/search.service";
import type { SearchCollectionViewerScope } from "../repositories/search-repository-types";

type RuntimeSettings = {
  searchResultLimit: number;
};

type CreateSearchControllerDeps = {
  searchService: SearchService;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  isDbProtected: () => boolean;
};

export type SearchController = ReturnType<typeof createSearchController>;

export function createSearchController(deps: CreateSearchControllerDeps) {
  const {
    searchService,
    getRuntimeSettingsCached,
    isDbProtected,
  } = deps;

  const canSeeSourceDetails = (req: AuthenticatedRequest) =>
    req.user?.role === "superuser" || req.user?.role === "admin";

  const resolveCollectionViewerScope = (
    req: AuthenticatedRequest,
  ): SearchCollectionViewerScope => {
    // General Search is a shared authenticated workspace. Collection status must
    // not change based on which staff member performs the same search.
    return req.user ? { kind: "all" } : { kind: "none" };
  };

  const getColumns = async (_req: AuthenticatedRequest, res: Response) => {
    return res.json(await searchService.getColumns());
  };

  const searchGlobal = async (req: AuthenticatedRequest, res: Response) => {
    const search = String(req.query.q || "").trim();
    const runtimeSettings = await getRuntimeSettingsCached();
    const page = Math.max(1, readInteger(req.query.page, 1));
    const requestedLimit = readPageLimit(
      req.query.pageSize ?? req.query.limit,
      50,
      runtimeSettings.searchResultLimit,
    );

    const collectionViewerScope = resolveCollectionViewerScope(req);
    return res.json(await searchService.searchGlobal({
      search,
      page,
      requestedLimit,
      maxTotal: runtimeSettings.searchResultLimit,
      isDbProtected: isDbProtected(),
      includeSourceDetails: canSeeSourceDetails(req),
      collectionViewerScope,
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
    const page = Math.max(1, readInteger(body.page, 1));
    const requestedLimit = readPageLimit(
      body.pageSize ?? body.limit,
      50,
      runtimeSettings.searchResultLimit,
    );

    const collectionViewerScope = resolveCollectionViewerScope(req);
    return res.json(await searchService.advancedSearch({
      filters,
      logic,
      page,
      requestedLimit,
      maxTotal: runtimeSettings.searchResultLimit,
      includeSourceDetails: canSeeSourceDetails(req),
      collectionViewerScope,
    }));
  };

  return {
    getColumns,
    searchGlobal,
    searchSimple,
    advancedSearch,
  };
}
