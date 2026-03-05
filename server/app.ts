import express from "express";
import authRoutes from "./routes/auth.routes";
import importRoutes from "./routes/imports.routes";
import searchRoutes from "./routes/search.routes";
import activityRoutes from "./routes/activity.routes";
import { analyzeAll } from "./controllers/import.controller";
import { authenticateToken } from "./middleware/authenticate";

const app = express();

const DEFAULT_BODY_LIMIT = "2mb";
const IMPORT_BODY_LIMIT = "50mb";

// Allow larger payload only for import endpoints.
app.use("/api/imports", express.json({ limit: IMPORT_BODY_LIMIT }));
app.use("/api/imports", express.urlencoded({ extended: true, limit: IMPORT_BODY_LIMIT }));
app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: DEFAULT_BODY_LIMIT }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/imports", importRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/activity", activityRoutes);
app.get("/api/analyze/all", authenticateToken, analyzeAll);

export default app;
