import type { Express, RequestHandler } from "express";
import type { SearchController } from "../controllers/search.controller";
import { asyncHandler } from "../http/async-handler";

type SearchRouteDeps = {
  searchController: SearchController;
  authenticateToken: RequestHandler;
  searchRateLimiter: RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
};

export function registerSearchRoutes(app: Express, deps: SearchRouteDeps) {
  const {
    searchController,
    authenticateToken,
    searchRateLimiter,
    requireTabAccess,
  } = deps;
  const requireSearch = requireTabAccess("general-search");

  app.get("/api/search/columns", authenticateToken, requireSearch, asyncHandler(searchController.getColumns));

  app.get("/api/columns", authenticateToken, requireSearch, asyncHandler(searchController.getColumns));

  app.get("/api/search/global", authenticateToken, requireSearch, searchRateLimiter, asyncHandler(searchController.searchGlobal));

  app.get(
    "/api/search/collection-history",
    authenticateToken,
    requireSearch,
    searchRateLimiter,
    asyncHandler(searchController.getCollectionHistory),
  );

  app.get("/api/search", authenticateToken, requireSearch, searchRateLimiter, asyncHandler(searchController.searchSimple));

  app.post("/api/search/advanced", authenticateToken, requireSearch, searchRateLimiter, asyncHandler(searchController.advancedSearch));
}
