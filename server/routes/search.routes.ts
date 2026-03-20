import type { Express, RequestHandler } from "express";
import type { SearchController } from "../controllers/search.controller";
import { asyncHandler } from "../http/async-handler";

type SearchRouteDeps = {
  searchController: SearchController;
  authenticateToken: RequestHandler;
  searchRateLimiter: RequestHandler;
};

export function registerSearchRoutes(app: Express, deps: SearchRouteDeps) {
  const {
    searchController,
    authenticateToken,
    searchRateLimiter,
  } = deps;

  app.get("/api/search/columns", authenticateToken, asyncHandler(searchController.getColumns));

  app.get("/api/columns", authenticateToken, asyncHandler(searchController.getColumns));

  app.get("/api/search/global", authenticateToken, searchRateLimiter, asyncHandler(searchController.searchGlobal));

  app.get("/api/search", authenticateToken, searchRateLimiter, asyncHandler(searchController.searchSimple));

  app.post("/api/search/advanced", authenticateToken, asyncHandler(searchController.advancedSearch));
}
