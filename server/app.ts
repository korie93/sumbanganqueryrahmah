import express from "express";
import authRoutes from "./routes/auth.routes";
import importRoutes from "./routes/imports.routes";
import searchRoutes from "./routes/search.routes";
import activityRoutes from "./routes/activity.routes";
import { analyzeAll } from "./controllers/import.controller";
import { authenticateToken } from "./middleware/authenticate";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

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
