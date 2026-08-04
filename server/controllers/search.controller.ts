import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { ensureObject, readInteger, readPageLimit } from "../http/validation";
import type { SearchService } from "../services/search.service";
import type { CollectionStoragePort } from "../services/collection/collection-service-support";
import {
  getAdminVisibleNicknameValues,
  resolveCurrentCollectionNicknameFromSession,
} from "../routes/collection-access";
import type { SearchCollectionViewerScope } from "../repositories/search-repository-types";
import { canViewAllStaff } from "../../shared/user-roles";

type RuntimeSettings = {
  searchResultLimit: number;
};

type CreateSearchControllerDeps = {
  searchService: SearchService;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  isDbProtected: () => boolean;
  collectionStorage: CollectionStoragePort;
};

export type SearchController = ReturnType<typeof createSearchController>;

export function createSearchController(deps: CreateSearchControllerDeps) {
  const {
    searchService,
    getRuntimeSettingsCached,
    isDbProtected,
    collectionStorage,
  } = deps;

  const canSeeSourceDetails = (req: AuthenticatedRequest) =>
    req.user?.role === "superuser" || req.user?.role === "admin";

  const resolveCollectionViewerScope = async (
    req: AuthenticatedRequest,
  ): Promise<SearchCollectionViewerScope> => {
    const user = req.user;
    if (!user) return { kind: "none" };
    if (canViewAllStaff(user.role)) return { kind: "all" };
    if (user.role === "admin") {
      const nicknames = await getAdminVisibleNicknameValues(collectionStorage, user);
      return nicknames.length > 0 ? { kind: "nicknames", nicknames } : { kind: "none" };
    }
    if (user.role === "user") {
      const nickname = await resolveCurrentCollectionNicknameFromSession(collectionStorage, user);
      return nickname
        ? { kind: "nicknames", nicknames: [nickname] }
        : { kind: "created_by", username: user.username };
    }
    return { kind: "none" };
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

    const collectionViewerScope = await resolveCollectionViewerScope(req);
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

    const collectionViewerScope = await resolveCollectionViewerScope(req);
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
