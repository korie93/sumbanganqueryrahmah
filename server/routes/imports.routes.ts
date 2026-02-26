import { Router } from "express";
import { authenticateToken } from "../middleware/authenticate";
import { searchRateLimiter } from "../middleware/rate-limit";
import {
  getImports,
  getImportData,
  analyzeImport,
  analyzeAll,
} from "../controllers/import.controller";

const router = Router();

// LIST IMPORTS
router.get("/", authenticateToken, getImports);

// VIEWER DATA
router.get(
  "/:id/data",
  authenticateToken,
  searchRateLimiter,
  getImportData
);

// ANALYZE SINGLE IMPORT
router.get(
  "/:id/analyze",
  authenticateToken,
  analyzeImport
);

export default router;
