import { Router } from "express";
import { authenticateToken } from "../middlewares/authenticate";
import { searchGlobal, advancedSearch, getSearchColumns } from "../controllers/search.controller";
import { searchRateLimiter } from "../middlewares/rateLimit";

const router = Router();

router.get("/global", authenticateToken, searchRateLimiter, searchGlobal);
router.post("/advanced", authenticateToken, searchRateLimiter, advancedSearch);
router.get("/columns", authenticateToken, getSearchColumns);

export default router;
