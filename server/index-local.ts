import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { PostgresStorage } from "./storage-postgres";
import { StringDecoder } from "string_decoder";
import { searchRateLimiter } from "./middleware/rate-limit";
import { ollamaChat, ollamaEmbed, getOllamaConfig } from "./ai-ollama";

const storage = new PostgresStorage();
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const JWT_SECRET = process.env.SESSION_SECRET || "sqr-local-secret-key-2025";
const connectedClients = new Map<string, WebSocket>();
const WS_IDLE_MINUTES = 3;
const WS_IDLE_MS = WS_IDLE_MINUTES * 60 * 1000;
const AI_PRECOMPUTE_ON_START = String(process.env.AI_PRECOMPUTE_ON_START || "0") === "1";
let idleSweepRunning = false;

const buildEmbeddingText = (data: Record<string, any>): string => {
  const preferredKeys = [
    "nama", "name", "full name", "alamat", "address", "bandar", "negeri",
    "employer", "majikan", "company", "occupation", "job", "department",
    "product", "model", "brand", "account", "akaun",
  ];
  const entries = Object.entries(data || {});
  const picked: string[] = [];

  for (const [key, value] of entries) {
    const lower = key.toLowerCase();
    if (!preferredKeys.some((p) => lower.includes(p))) continue;
    const v = String(value ?? "").trim();
    if (!v) continue;
    if (/^\d+$/.test(v)) continue; // skip numeric-only
    picked.push(`${key}: ${v}`);
    if (picked.length >= 20) break;
  }

  if (picked.length === 0) {
    for (const [key, value] of entries) {
      const v = String(value ?? "").trim();
      if (!v) continue;
      if (/^\d+$/.test(v)) continue;
      picked.push(`${key}: ${v}`);
      if (picked.length >= 15) break;
    }
  }

  const text = picked.join("\n");
  return text.length > 2000 ? text.slice(0, 2000) : text;
};


function parseBrowser(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown";

  const ua = userAgent;
  const uaLower = ua.toLowerCase();

  const extractVersion = (pattern: RegExp): string => {
    const match = ua.match(pattern);
    if (match && match[1]) {
      const parts = match[1].split('.');
      return parts[0];
    }
    return "";
  };

  if (uaLower.includes("edg/")) {
    const ver = extractVersion(/Edg\/(\d+[\d.]*)/i);
    return ver ? `Edge ${ver}` : "Edge";
  }
  if (uaLower.includes("edge/")) {
    const ver = extractVersion(/Edge\/(\d+[\d.]*)/i);
    return ver ? `Edge ${ver}` : "Edge";
  }
  if (uaLower.includes("opr/")) {
    const ver = extractVersion(/OPR\/(\d+[\d.]*)/i);
    return ver ? `Opera ${ver}` : "Opera";
  }
  if (uaLower.includes("opera/")) {
    const ver = extractVersion(/Opera\/(\d+[\d.]*)/i);
    return ver ? `Opera ${ver}` : "Opera";
  }
  if (uaLower.includes("brave")) {
    const ver = extractVersion(/Brave\/(\d+[\d.]*)/i) || extractVersion(/Chrome\/(\d+[\d.]*)/i);
    return ver ? `Brave ${ver}` : "Brave";
  }
  if (uaLower.includes("duckduckgo")) {
    const ver = extractVersion(/DuckDuckGo\/(\d+[\d.]*)/i);
    return ver ? `DuckDuckGo ${ver}` : "DuckDuckGo";
  }
  if (uaLower.includes("vivaldi")) {
    const ver = extractVersion(/Vivaldi\/(\d+[\d.]*)/i);
    return ver ? `Vivaldi ${ver}` : "Vivaldi";
  }
  if (uaLower.includes("firefox/") || uaLower.includes("fxios/")) {
    const ver = extractVersion(/Firefox\/(\d+[\d.]*)/i) || extractVersion(/FxiOS\/(\d+[\d.]*)/i);
    return ver ? `Firefox ${ver}` : "Firefox";
  }
  if (uaLower.includes("safari/") && !uaLower.includes("chrome/") && !uaLower.includes("chromium/")) {
    const ver = extractVersion(/Version\/(\d+[\d.]*)/i);
    return ver ? `Safari ${ver}` : "Safari";
  }
  if (uaLower.includes("chrome/") || uaLower.includes("crios/") || uaLower.includes("chromium/")) {
    const ver = extractVersion(/Chrome\/(\d+[\d.]*)/i) || extractVersion(/CriOS\/(\d+[\d.]*)/i);
    return ver ? `Chrome ${ver}` : "Chrome";
  }
  if (uaLower.includes("msie") || uaLower.includes("trident/")) {
    const ver = extractVersion(/MSIE (\d+[\d.]*)/i) || extractVersion(/rv:(\d+[\d.]*)/i);
    return ver ? `Internet Explorer ${ver}` : "Internet Explorer";
  }

  return "Unknown";
}

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

interface AuthenticatedUser {
  username: string;
  role: string;
  activityId: string;
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;

    // 🔐 STEP 3A — VALIDATE SESSION DARI DB
    const activity = await storage.getActivityById(decoded.activityId);

    if (
      !activity ||
      activity.isActive === false ||
      activity.logoutTime !== null
    ) {
      return res.status(401).json({
        message: "Session expired. Please login again.",
        forceLogout: true,
      });
    }

    const isVisitorBanned = await storage.isVisitorBanned(
      activity.fingerprint ?? null,
      activity.ipAddress ?? null
    );
    if (isVisitorBanned) {
      return res.status(401).json({
        message: "Session banned. Please login again.",
        forceLogout: true,
      });
    }

    // Keep session alive on authenticated API activity.
    await storage.updateActivity(decoded.activityId, {
      lastActivityTime: new Date(),
      isActive: true,
    });

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid token" });
  }
}

function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mode: "postgresql" });
});

app.get("/api/data-rows", authenticateToken, async (req, res) => {
  try {
    const importId = req.query.importId as string;
    const limit = Number(req.query.limit ?? 10);
    const offset = Number(req.query.offset ?? 0);

    if (!importId) {
      return res.status(400).json({ error: "importId is required" });
    }

    const search = String(req.query.q || "").trim();

    const result = await storage.searchDataRows({
      importId,
      search,
      limit,
      offset,
    });

    res.json(result);
  } catch (err) {
    console.error("API /api/data-rows error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function handleLogin(req: Request, res: Response) {
  try {
    const { username, password, fingerprint, pcName, browser } = req.body;

    const user = await storage.getUserByUsername(username);
    if (!user) {
      await storage.createAuditLog({
        action: "LOGIN_FAILED",
        performedBy: username,
        details: "User not found",
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isVisitorBanned = await storage.isVisitorBanned(fingerprint || null, req.ip || req.socket.remoteAddress || null);
    if (isVisitorBanned) {
      await storage.createAuditLog({
        action: "LOGIN_FAILED_BANNED",
        performedBy: username,
        details: "Visitor is banned",
      });
      return res.status(403).json({ message: "Account is banned", banned: true });
    }

    if (user.isBanned) {
      await storage.createAuditLog({
        action: "LOGIN_FAILED_BANNED",
        performedBy: username,
        details: "User is banned",
      });
      return res.status(403).json({ message: "Account is banned", banned: true });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      await storage.createAuditLog({
        action: "LOGIN_FAILED",
        performedBy: username,
        details: "Invalid password",
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const browserName = parseBrowser(browser || req.headers["user-agent"]);

    // 🔐 ROLE-BASED SESSION CONTROL (TAMBAH DI SINI SAHAJA)
    if (user.role === "superuser") {
      // ❌ SUPERUSER: 1 SESSION GLOBAL SAHAJA
      await storage.deactivateUserActivities(username, "NEW_LOGIN");
    }
    else if (user.role === "admin" && fingerprint) {
      // ⚠️ ADMIN: 1 SESSION PER DEVICE
      await storage.deactivateUserSessionsByFingerprint(
        username,
        fingerprint
      );
    }
    // ✅ USER BIASA: TAK PERLU BUAT APA-APA

    // ➕ CREATE SESSION BARU
    const activity = await storage.createActivity({
      userId: user.id,
      username: user.username,
      role: user.role,
      pcName: pcName || null,
      browser: browserName,
      fingerprint: fingerprint || null,
      ipAddress: req.ip || req.socket.remoteAddress || null,
    });

    const token = jwt.sign(
      {
        username: user.username,
        role: user.role,
        activityId: activity.id,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    await storage.createAuditLog({
      action: "LOGIN_SUCCESS",
      performedBy: username,
      details: `Login from ${browserName}`,
    });

    res.json({
      token,
      username: user.username,
      role: user.role,
      user: { username: user.username, role: user.role },
      activityId: activity.id,
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

app.post("/api/login", handleLogin);
app.post("/api/auth/login", handleLogin);

app.post("/api/activity/logout", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false });
    }

    const activityId = req.user.activityId;

    // 🔐 FIX ISSUE #2 — RACE PROTECTION
    const activity = await storage.getActivityById(activityId);
    if (!activity || activity.isActive === false) {
      return res.json({ success: true });
    }

    // 1️⃣ TUTUP SESSION DALAM DB
    await storage.updateActivity(activityId, {
      isActive: false,
      logoutTime: new Date(),
      logoutReason: "USER_LOGOUT",
    });

    // 2️⃣ TUTUP WEBSOCKET (JIKA ADA)
    const ws = connectedClients.get(activityId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "logout",
        reason: "User logged out",
      }));
      ws.close();
    }

    connectedClients.delete(activityId);

    // 3️⃣ AUDIT LOG
    await storage.createAuditLog({
      action: "LOGOUT",
      performedBy: req.user.username,
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/activity/all", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
  try {
    const activities = await storage.getAllActivities();
    res.json({ activities });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/activity/filter", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
  try {
    const filters: any = {};
    if (req.query.status) {
      filters.status = (req.query.status as string).split(",");
    }
    if (req.query.username) filters.username = req.query.username as string;
    if (req.query.ipAddress) filters.ipAddress = req.query.ipAddress as string;
    if (req.query.browser) filters.browser = req.query.browser as string;
    if (req.query.dateFrom) filters.dateFrom = new Date(req.query.dateFrom as string);
    if (req.query.dateTo) filters.dateTo = new Date(req.query.dateTo as string);

    const activities = await storage.getFilteredActivities(filters);
    res.json({ activities });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.delete(
  "/api/activity/:id",
  authenticateToken,
  requireRole("admin", "superuser"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const activityId = String(req.params.id);

      if (!activityId) {
        return res.status(400).json({
          success: false,
          message: "Invalid activityId",
        });
      }

      await storage.deleteActivity(activityId);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete activity error:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

app.post(
  "/api/activity/kick",
  authenticateToken,
  requireRole("admin", "superuser"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const activityId = String(req.body.activityId);

      if (!activityId) {
        return res.status(400).json({
          success: false,
          message: "Invalid activityId",
        });
      }

      const activity = await storage.getActivityById(activityId);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      // 1️⃣ TUTUP SESSION DALAM DB
      await storage.updateActivity(activityId, {
        isActive: false,
        logoutTime: new Date(),
        logoutReason: "KICKED",
      });

      // 2️⃣ TUTUP WEBSOCKET (GUNA activityId)
      const ws = connectedClients.get(activityId);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "kicked",
          reason: "You have been logged out by an administrator.",
        }));

        ws.close();
      }

      connectedClients.delete(activityId);

      // 3️⃣ AUDIT LOG
      await storage.createAuditLog({
        action: "KICK_USER",
        performedBy: req.user!.username,
        targetUser: activity.username,
        details: `Kicked activityId=${activityId}`,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Activity kick error:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

app.post(
  "/api/activity/ban",
  authenticateToken,
  requireRole("superuser"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const activityId = String(req.body.activityId);
      if (!activityId) {
        return res.status(400).json({
          success: false,
          message: "Invalid activityId",
        });
      }

      const activity = await storage.getActivityById(activityId);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      // ❌ Tak boleh ban superuser
      const targetUser = await storage.getUserByUsername(activity.username);
      if (targetUser?.role === "superuser") {
        return res.status(403).json({ message: "Cannot ban a superuser" });
      }

      // 1️⃣ BAN VISITOR (SESSION-LEVEL)
      await storage.banVisitor({
        username: activity.username,
        role: activity.role,
        activityId: activity.id,
        fingerprint: activity.fingerprint ?? null,
        ipAddress: activity.ipAddress ?? null,
        browser: activity.browser ?? null,
        pcName: activity.pcName ?? null,
      });

      // 2️⃣ TUTUP SESSION DB (ACTIVITY SAHAJA)
      await storage.updateActivity(activityId, {
        isActive: false,
        logoutTime: new Date(),
        logoutReason: "BANNED",
      });

      // 3️⃣ TUTUP WEBSOCKET (ACTIVITY SAHAJA)
      const ws = connectedClients.get(activityId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "banned",
          reason: "Your account has been banned.",
        }));
        ws.close();
      }
      connectedClients.delete(activityId);

      // 4️⃣ AUDIT LOG
      await storage.createAuditLog({
        action: "BAN_USER",
        performedBy: req.user!.username,
        targetUser: activity.username,
        details: `Banned via activityId=${activityId}`,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Activity ban error:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

app.get("/api/users/banned", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
  try {
    const bannedSessions = await storage.getBannedSessions();
    const usersWithVisitorId = bannedSessions.map((s) => ({
      visitorId: s.banId,
      banId: s.banId,
      username: s.username,
      role: s.role,
      banInfo: {
        ipAddress: s.ipAddress ?? null,
        browser: s.browser ?? null,
        bannedAt: s.bannedAt ?? null,
      },
    }));
    res.json({ users: usersWithVisitorId });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/search/columns", authenticateToken, async (req, res) => {
  try {
    const columns = await storage.getAllColumnNames();
    res.json(columns);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/auth/me", authenticateToken, (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthenticated" });
  }

  res.json({
    user: {
      username: req.user.username,
      role: req.user.role,
      activityId: req.user.activityId,
    },
  });
});

app.post("/api/activity/heartbeat", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, message: "Unauthenticated" });
    }

    const activityId = req.user!.activityId;

    console.log("================================");
    console.log("HEARTBEAT MASUK");
    console.log("Username:", req.user.username);
    console.log("ActivityId:", activityId);
    console.log("Time:", new Date().toISOString());
    console.log("================================");

    await storage.updateActivity(activityId, {
      lastActivityTime: new Date(),
      isActive: true,
    });

    res.json({
      ok: true,
      status: "ONLINE",
      lastActivityTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Heartbeat error:", err);
    res.status(500).json({ ok: false });
  }
});

app.get("/api/imports", authenticateToken, async (req, res) => {
  try {
    const allImports = await storage.getImports();
    const importsWithRowCount = await Promise.all(
      allImports.map(async (imp) => {
        const rowCount = await storage.getDataRowCountByImport(imp.id);
        return { ...imp, rowCount };
      })
    );
    res.json({ imports: importsWithRowCount });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/imports", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, filename, rows, data } = req.body;
    const dataRows = rows || data || [];

    if (!Array.isArray(dataRows) || dataRows.length === 0) {
      return res.status(400).json({ message: "No data rows provided" });
    }

    const importRecord = await storage.createImport({
      name,
      filename,
      createdBy: req.user?.username,
    });

    for (const row of dataRows) {
      await storage.createDataRow({
        importId: importRecord.id,
        jsonDataJsonb: row,
      });
    }

    await storage.createAuditLog({
      action: "IMPORT_DATA",
      performedBy: req.user!.username,
      targetResource: name,
      details: `Imported ${dataRows.length} rows from ${filename}`,
    });

    res.json(importRecord);
  } catch (error: any) {
    console.error("Import error:", error);
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/imports/:id", authenticateToken, async (req, res) => {
  try {
    const importRecord = await storage.getImportById(req.params.id);
    if (!importRecord) {
      return res.status(404).json({ message: "Import not found" });
    }
    const rows = await storage.getDataRowsByImport(req.params.id);
    res.json({ import: importRecord, rows });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.get(
  "/api/imports/:id/data",
  authenticateToken,
  searchRateLimiter,
  async (req, res) => {
    try {
      const importId = req.params.id;
      const page = Math.max(1, Number(req.query.page ?? 1));
      const limit = Math.min(Number(req.query.limit ?? 100), 500);
      const offset = (page - 1) * limit;
      const search = String(req.query.search || "").trim();

      console.log(`📥 /api/imports/:id/data called: importId=${importId}, page=${page}, search="${search}"`);

      if (!importId) {
        return res.status(400).json({ message: "importId is required" });
      }

      const result = await storage.searchDataRows({
        importId,
        search: search || null,
        limit,
        offset,
      });

      // Return in format expected by Viewer component
      const safeRows = result.rows || [];
      const formattedRows = safeRows.map((row: any) => ({
        id: row.id,
        importId: row.importId,
        jsonDataJsonb: row.jsonDataJsonb,
      }));

      console.log(`📤 Returning ${formattedRows.length} rows, total: ${result.total}`);

      // RESPONSE FORMAT EXPECTED BY VIEWER
      return res.json({
        rows: formattedRows,
        total: result.total || 0,
        page,
        limit,
      });

    } catch (error: any) {
      console.error("GET /api/imports/:id/data error:", error);
      return res.status(500).json({ message: error.message });
    }
  }
);

app.get(
  "/api/search/global",
  authenticateToken,
  searchRateLimiter,
  async (req, res) => {
    try {
      const search = String(req.query.q || "").trim();
        console.log(`🔎 /api/search/global called: search="${search}"`);
      
      const page = Math.max(1, Number(req.query.page ?? 1));
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = (page - 1) * limit;

      if (search.length < 2) {
          console.log(`🔎 Search too short (${search.length} chars), returning empty`);
        return res.json({
          columns: [],
          rows: [],
          results: [],
          total: 0,
        });
      }

      const result = await storage.searchGlobalDataRows({
        search,
        limit,
        offset,
      });

        console.log(`🔎 Global search found: ${result.rows.length} rows (total: ${result.total})`);

      const parsedRows = result.rows.map((r: any) => {
        const base =
          r.jsonDataJsonb && typeof r.jsonDataJsonb === "object"
            ? r.jsonDataJsonb
            : {};
        const sourceFile = r.importFilename || r.importName || "";
        return {
          ...base,
          "Source File": sourceFile,
        };
      });

      // ✅ FIX KRITIKAL — gabung SEMUA column
      const columnSet = new Set<string>();
      for (const row of parsedRows) {
        Object.keys(row).forEach((key) => columnSet.add(key));
      }

      if (parsedRows.length > 0) {
        console.log(`🔎 Sample parsed row keys: ${Object.keys(parsedRows[0]).slice(0,20).join(',')}`);
      } else {
        console.log('🔎 No parsed rows to sample');
      }

      return res.json({
        columns: Array.from(columnSet),
        rows: parsedRows,
        results: parsedRows,
        total: result.total,
        page,
        limit,
      });

    } catch (error: any) {
      console.error("GET /api/search/global error:", error);
      return res.status(500).json({ message: error.message });
    }
  }
);

app.get(
  "/api/search",
  authenticateToken,
  searchRateLimiter,
  async (req, res) => {
    try {
      const search = String(req.query.q || "").trim();

      if (search.length < 2) {
        return res.json({ results: [], total: 0 });
      }

      const queryResult = await storage.searchSimpleDataRows(search);
      const rows = queryResult.rows || [];

      // 🔥 PENTING: attach import context
      const results = rows.map((r: any) => ({
        ...r.jsonDataJsonb,
        _importId: r.importId,
        _importName: r.importName,
      }));

      return res.json({
        results,
        total: results.length,
      });
    } catch (err: any) {
      console.error("GET /api/search error:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

// Helper function: Validate Malaysian IC date (YYMMDD)
function isValidMalaysianIC(ic: string): boolean {
  if (!/^\d{12}$/.test(ic)) return false;

  // Malaysian phone numbers start with 01 - exclude these
  if (ic.startsWith('01')) return false;

  // Extract date parts: YYMMDD
  const mm = parseInt(ic.substring(2, 4), 10);
  const dd = parseInt(ic.substring(4, 6), 10);

  // Validate month (01-12)
  if (mm < 1 || mm > 12) return false;

  // Validate day (01-31) - basic check
  if (dd < 1 || dd > 31) return false;

  // More specific day validation based on month
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (dd > daysInMonth[mm - 1]) return false;

  return true;
}

// Column exclusion lists for IC detection
// Note: Avoid generic terms like "NOMBOR" which would exclude valid IC columns
const excludeColumnsFromIC = ['AGREEMENT', 'LOAN', 'ACCOUNT', 'AKAUN', 'PINJAMAN', 'CONTRACT', 'KONTRAK',
  'REFERENCE', 'TRANSACTION', 'TRANSAKSI', 'PHONE', 'TELEFON', 'MOBILE', 'HANDPHONE',
  'FAX', 'FAKS', 'E-MONEY'];
const excludeColumnsFromPolice = ['VEHICLE', 'KENDERAAN', 'REGISTRATION', 'PLATE', 'RSTG',
  'CAR', 'KERETA', 'MOTOR', 'MOTOSIKAL', 'VEH', 'PENDAFTARAN'];

// Helper to split cell values by common delimiters including single spaces
function splitCellValue(val: string): string[] {
  // Remove labels like IC1:, IC2:, NRIC:, NO IC:, etc.
  const withoutLabels = val.replace(/\b(IC\d*|NRIC|NO\.?\s*IC|KAD PENGENALAN|KP)\s*[:=]/gi, ' ');
  // Split by common delimiters: / , ; | newlines AND whitespace (single or multiple)
  return withoutLabels.split(/[\/,;|\n\r\s]+/).map(s => s.trim()).filter(s => s.length > 0);
}

function analyzeDataRows(rows: any[]) {
  const icLelakiSet = new Set<string>();
  const icPerempuanSet = new Set<string>();
  const noPolisSet = new Set<string>();
  const noTenteraSet = new Set<string>();
  const passportMYSet = new Set<string>();
  const passportLuarNegaraSet = new Set<string>();
  const valueCounts: Record<string, number> = {};
  const processedValues = new Set<string>();

  const passportPattern = /^[A-Z]{1,2}\d{6,9}$/i;
  const malaysiaPassportPrefixes = ['A', 'H', 'K', 'Q'];
  const excludePrefixes = ['LOT', 'NO', 'PT', 'KM', 'JLN', 'BLK', 'TMN', 'KG', 'SG', 'BTU', 'RM'];

  // Validation functions with minimum digit requirements to avoid false positives
  // Single letter prefix: 5+ digits, Two letters: 4+ digits, Three+: 3+ digits
  const isValidPolisNo = (val: string): boolean => {
    // Exclude any police number that starts with "P"
    if (/^P\d{3,}$/i.test(val)) return false;
    if (/^G\d{5,10}$/i.test(val)) return true;
    if (/^(RF|SW)\d{4,10}$/i.test(val)) return true;
    if (/^(RFT|PDRM|POLIS|POL)\d{3,10}$/i.test(val)) return true;
    return false;
  };

  const isValidTenteraNo = (val: string): boolean => {
    // Exclude any military number that starts with "M"
    if (/^M\d{3,}$/i.test(val)) return false;
    if (/^T\d{5,10}$/i.test(val)) return true;
    if (/^(TD|TA|TT)\d{4,10}$/i.test(val)) return true;
    if (/^(TLDM|TUDM|ARMY|ATM|MAF|TEN|MIL)\d{3,10}$/i.test(val)) return true;
    return false;
  };

  rows.forEach((row: any) => {
    try {
      const data =
        row.jsonDataJsonb && typeof row.jsonDataJsonb === "object"
          ? row.jsonDataJsonb
          : {};
      Object.entries(data).forEach(([key, val]) => {
        if (val && typeof val === "string") {
          const keyUpper = key.toUpperCase();
          const isExcludedFromIC = excludeColumnsFromIC.some(excl => keyUpper.includes(excl));
          const isExcludedFromPolice = excludeColumnsFromPolice.some(excl => keyUpper.includes(excl));

          // Split cell value to handle multiple IDs per cell
          const fragments = splitCellValue(val.toString());

          for (const fragment of fragments) {
            const cleaned = fragment.toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (cleaned.length === 0) continue;

            valueCounts[cleaned] = (valueCounts[cleaned] || 0) + 1;

            if (processedValues.has(cleaned)) continue;
            processedValues.add(cleaned);

            // IC Detection with proper validation
            if (!isExcludedFromIC && isValidMalaysianIC(cleaned)) {
              const lastDigit = parseInt(cleaned.charAt(11), 10);
              if (lastDigit % 2 === 1) {
                icLelakiSet.add(cleaned);
              } else {
                icPerempuanSet.add(cleaned);
              }
            } else if (!isExcludedFromPolice && isValidPolisNo(cleaned)) {
              noPolisSet.add(cleaned);
            } else if (isValidTenteraNo(cleaned)) {
              noTenteraSet.add(cleaned);
            } else if (passportPattern.test(cleaned)) {
              const isExcluded = excludePrefixes.some(prefix => cleaned.startsWith(prefix));
              if (!isExcluded) {
                const firstChar = cleaned.charAt(0);
                if (malaysiaPassportPrefixes.includes(firstChar)) {
                  passportMYSet.add(cleaned);
                } else {
                  passportLuarNegaraSet.add(cleaned);
                }
              }
            }
          }
        }
      });
    } catch { }
  });

  const icLelaki = Array.from(icLelakiSet);
  const icPerempuan = Array.from(icPerempuanSet);
  const noPolis = Array.from(noPolisSet);
  const noTentera = Array.from(noTenteraSet);
  const passportMY = Array.from(passportMYSet);
  const passportLuarNegara = Array.from(passportLuarNegaraSet);

  const duplicateItems = Object.entries(valueCounts)
    .filter(([_, count]) => count > 1)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);

  // Return only counts and limited samples (no 'all' arrays to save memory)
  return {
    icLelaki: { count: icLelaki.length, samples: icLelaki.slice(0, 50) },
    icPerempuan: { count: icPerempuan.length, samples: icPerempuan.slice(0, 50) },
    noPolis: { count: noPolis.length, samples: noPolis.slice(0, 50) },
    noTentera: { count: noTentera.length, samples: noTentera.slice(0, 50) },
    passportMY: { count: passportMY.length, samples: passportMY.slice(0, 50) },
    passportLuarNegara: { count: passportLuarNegara.length, samples: passportLuarNegara.slice(0, 50) },
    duplicates: { count: duplicateItems.length, items: duplicateItems.slice(0, 50) },
  };
}

app.get("/api/imports/:id/analyze", authenticateToken, async (req, res) => {
  try {
    const importRecord = await storage.getImportById(req.params.id);
    if (!importRecord) {
      return res.status(404).json({ message: "Import not found" });
    }
    const rows = await storage.getDataRowsByImport(req.params.id);
    const analysis = analyzeDataRows(rows);

    res.json({
      import: { id: importRecord.id, name: importRecord.name, filename: importRecord.filename },
      totalRows: rows.length,
      analysis,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/analyze/all-summary", authenticateToken, async (req, res) => {
  try {
    const imports = await storage.getImports();
    if (imports.length === 0) {
      return res.json({
        totalImports: 0,
        totalRows: 0,
        imports: [],
        analysis: {
          icLelaki: { count: 0, samples: [] },
          icPerempuan: { count: 0, samples: [] },
          noPolis: { count: 0, samples: [] },
          noTentera: { count: 0, samples: [] },
          passportMY: { count: 0, samples: [] },
          passportLuarNegara: { count: 0, samples: [] },
          duplicates: { count: 0, items: [] },
        },
      });
    }

    let allRows: any[] = [];
    const importsWithCounts = await Promise.all(
      imports.map(async (imp: any) => {
        const rows = await storage.getDataRowsByImport(imp.id);
        allRows = allRows.concat(rows);
        return { id: imp.id, name: imp.name, filename: imp.filename, rowCount: rows.length };
      })
    );

    const analysis = analyzeDataRows(allRows);

    res.json({
      totalImports: imports.length,
      totalRows: allRows.length,
      imports: importsWithCounts,
      analysis,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.patch("/api/imports/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { name } = req.body;
    const updated = await storage.updateImportName(req.params.id, name);
    if (!updated) {
      return res.status(404).json({ message: "Import not found" });
    }
    await storage.createAuditLog({
      action: "UPDATE_IMPORT",
      performedBy: req.user!.username,
      targetResource: name,
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.patch("/api/imports/:id/rename", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { name } = req.body;
    const updated = await storage.updateImportName(req.params.id, name);
    if (!updated) {
      return res.status(404).json({ message: "Import not found" });
    }
    await storage.createAuditLog({
      action: "UPDATE_IMPORT",
      performedBy: req.user!.username,
      targetResource: name,
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.delete("/api/imports/:id", authenticateToken, requireRole("admin", "superuser"), async (req: AuthenticatedRequest, res) => {
  try {
    const importRecord = await storage.getImportById(req.params.id);
    const deleted = await storage.deleteImport(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Import not found" });
    }
    await storage.createAuditLog({
      action: "DELETE_IMPORT",
      performedBy: req.user!.username,
      targetResource: importRecord?.name || req.params.id,
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/search/advanced", authenticateToken, async (req, res) => {
  try {
    const { filters, logic, page = 1, limit = 50 } = req.body;
    const safePage = Math.max(1, Number(page));
    const safeLimit = Math.min(Number(limit), 200);
    const offset = (safePage - 1) * safeLimit;

    const rawResult = await storage.advancedSearchDataRows(filters, logic || "AND", safeLimit, offset);
    const importsList = await storage.getImports();
    const importMap = new Map(importsList.map((imp) => [imp.id, imp]));
    const parsedResults = rawResult.rows.map((row: any) => {
      const base =
        row.jsonDataJsonb && typeof row.jsonDataJsonb === "object"
          ? row.jsonDataJsonb
          : {};
      const imp = importMap.get(row.importId);
      const sourceFile = imp?.filename || imp?.name || "";
      return { ...base, "Source File": sourceFile };
    });
    const columnSet = new Set<string>();
    for (const row of parsedResults) {
      Object.keys(row).forEach((key) => columnSet.add(key));
    }

    const headers = Array.from(columnSet);
    res.json({
      results: parsedResults,
      headers,
      total: rawResult.total || 0,
      page: safePage,
      limit: safeLimit,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/ai/config", authenticateToken, requireRole("user", "admin", "superuser"), async (req, res) => {
  res.json(getOllamaConfig());
});

type AiIntent = {
  intent: string;
  entities: {
    name?: string | null;
    ic?: string | null;
    account_no?: string | null;
    phone?: string | null;
    address?: string | null;
    count_groups?: string[] | null;
  };
  need_nearest_branch: boolean;
};

const extractJsonObject = (text: string): any | null => {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  const jsonText = text.slice(first, last + 1);
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
};

const parseIntentFallback = (query: string): AiIntent => {
  const lower = query.toLowerCase();
  const digits = query.match(/\d{6,}/g) || [];
  const ic = digits.find((d) => d.length === 12) || null;
  const account = digits.find((d) => d.length >= 10 && d.length <= 16) || null;
  const phone = digits.find((d) => d.length >= 9 && d.length <= 11) || null;
  const needBranch = /cawangan|branch|terdekat|nearest|lokasi|alamat/i.test(query);
  const name = needBranch ? null : (ic ? null : query.trim());
  return {
    intent: "search_person",
    entities: {
      name,
      ic,
      account_no: account,
      phone,
      address: null,
      count_groups: null,
    },
    need_nearest_branch: needBranch,
  };
};

type CategoryRule = { key: string; terms: string[]; fields: string[]; matchMode?: string; enabled?: boolean };

const DEFAULT_COUNT_GROUPS: Array<CategoryRule> = [
  {
    key: "kerajaan",
    terms: [
      "kerajaan", "government", "gov", "gomen", "sector awam", "public sector",
      "kementerian", "jabatan", "agensi", "persekutuan", "negeri", "majlis",
      "kkm", "kpm", "kpt", "moe", "moh", "state government", "federal",
      "sekolah", "guru", "teacher", "cikgu", "pendidikan",
      "government",
    ],
    fields: [
      "EMPLOYER NAME",
      "NATURE OF BUSINESS",
      "NOB",
      "EmployerName",
      "Nature of Business",
      "Company",
      "Nama Majikan",
      "Majikan",
      "Department",
      "Agensi",
      ],
      matchMode: "contains",
    },
    {
      key: "polis",
    terms: ["polis", "police", "pdrm", "polis diraja malaysia", "ipd", "ipk"],
    fields: [
      "EMPLOYER NAME",
      "NATURE OF BUSINESS",
      "NOB",
      "EmployerName",
      "Nature of Business",
      "Company",
      "Nama Majikan",
      "Majikan",
      "Department",
      "Agensi",
      ],
      matchMode: "contains",
    },
    {
      key: "tentera",
    terms: ["tentera", "army", "military", "atm", "angkatan tentera", "tldm", "tudm", "tentera darat", "tentera laut", "tentera udara"],
    fields: [
      "EMPLOYER NAME",
      "NATURE OF BUSINESS",
      "NOB",
      "EmployerName",
      "Nature of Business",
      "Company",
      "Nama Majikan",
      "Majikan",
      "Department",
      "Agensi",
      ],
      matchMode: "contains",
    },
    {
      key: "hospital",
    terms: ["hospital", "klinik", "clinic", "medical", "kesihatan", "health", "klin ik", "medical center", "healthcare"],
    fields: [
      "EMPLOYER NAME",
      "NATURE OF BUSINESS",
      "NOB",
      "EmployerName",
      "Nature of Business",
      "Company",
      "Nama Majikan",
      "Majikan",
      "Department",
      "Agensi",
      ],
      matchMode: "contains",
    },
    {
      key: "hotel",
    terms: ["hotel", "hospitality", "resort", "inn", "motel", "restaurant"],
    fields: [
      "EMPLOYER NAME",
      "NATURE OF BUSINESS",
      "NOB",
      "EmployerName",
      "Nature of Business",
      "Company",
      "Nama Majikan",
      "Majikan",
      "Department",
      "Agensi",
      ],
      matchMode: "contains",
    },
    {
      key: "swasta",
      terms: ["swasta", "private", "sdn bhd", "bhd", "enterprise", "trading", "ltd", "plc"],
    fields: [
      "EMPLOYER NAME",
      "NATURE OF BUSINESS",
      "NOB",
      "EmployerName",
      "Nature of Business",
      "Company",
      "Nama Majikan",
      "Majikan",
      "Department",
        "Agensi",
      ],
      matchMode: "complement",
    },
  ];

const CATEGORY_RULES_CACHE_MS = 60_000;
let categoryRulesCache: { ts: number; rules: CategoryRule[] } | null = null;

const loadCategoryRules = async (): Promise<CategoryRule[]> => {
  if (categoryRulesCache && Date.now() - categoryRulesCache.ts < CATEGORY_RULES_CACHE_MS) {
    return categoryRulesCache.rules;
  }
  try {
    const rules = await storage.getCategoryRules();
    if (rules.length > 0) {
      categoryRulesCache = { ts: Date.now(), rules };
      return rules;
    }
  } catch {
    // fallback below
  }
  return DEFAULT_COUNT_GROUPS;
};

const detectCountRequest = (
  query: string,
  rules: CategoryRule[]
): Array<CategoryRule> | null => {
  const lower = query.toLowerCase();
  const trigger = /(berapa|jumlah|bilangan|ramai|count|how many|berapa orang)/i.test(lower);
  if (!trigger) return null;
  const enabledRules = rules.filter((rule) => rule.enabled !== false);
  const matched = enabledRules.filter((group) =>
    group.terms.some((term) => lower.includes(term.toLowerCase())) ||
    lower.includes(group.key)
  );
  return matched.length > 0 ? matched : enabledRules;
};

const statsCache = new Map<string, { ts: number; payload: any }>();
const statsInflight = new Map<string, boolean>();
const STATS_CACHE_MS = 60_000;
const categoryStatsInflight = new Map<string, Promise<void>>();

const enqueueCategoryStatsCompute = (keys: string[], rules: Array<CategoryRule>) => {
  const normalized = Array.from(new Set(keys)).filter(Boolean).sort();
  if (!normalized.length) return;
  const queueKey = normalized.join("|");
  if (categoryStatsInflight.has(queueKey)) return;
  const task = storage
    .computeCategoryStatsForKeys(normalized, rules)
    .then(() => undefined)
    .catch((err) => {
      console.error("Category stats compute failed:", err?.message || err);
    })
    .finally(() => {
      categoryStatsInflight.delete(queueKey);
    });
  categoryStatsInflight.set(queueKey, task);
};

const startStatsCompute = (key: string, groups: Array<CategoryRule>) => {
  if (statsInflight.get(key)) return;
  statsInflight.set(key, true);
  setTimeout(async () => {
    try {
      const stats = await storage.countRowsByKeywords({ groups });
      const summaryLines = [
        "Ringkasan Statistik (berdasarkan data import):",
        `Jumlah rekod dianalisis: ${stats.totalRows}`,
      ];
      for (const group of groups) {
        const count = stats.counts[group.key] ?? 0;
        summaryLines.push(`- ${group.key}: ${count}`);
      }
      const explanation = await buildExplanation({
        decision: null,
        distanceKm: null,
        branch: null,
        personName: null,
        personSummary: [],
        branchSummary: [],
        estimatedMinutes: null,
        travelMode: null,
        missingCoords: false,
        suggestions: [],
        countSummary: summaryLines,
        matchFields: [],
      });
      const payload = {
        person: null,
        nearest_branch: null,
        decision: null,
        ai_explanation: explanation,
        stats,
      };
      statsCache.set(key, { ts: Date.now(), payload });
    } catch (err) {
      console.error("Stats compute failed:", err);
    } finally {
      statsInflight.delete(key);
    }
  }, 0);
};

const tokenizeQuery = (text: string): string[] => {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/gi, ""))
    .filter((t) => t.length >= 3);
};

const buildFieldMatchSummary = (data: Record<string, any>, query: string): string[] => {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];
  const matches: Array<{ key: string; value: string; score: number }> = [];
  const entries = Object.entries(data || {}).slice(0, 80);
  for (const [key, val] of entries) {
    if (key === "id") continue;
    const valueStr = String(val ?? "");
    const valueLower = valueStr.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (valueLower.includes(t)) score += 1;
    }
    if (score > 0) {
      matches.push({ key, value: valueStr, score });
    }
  }
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((m) => `${m.key}: ${m.value}`);
};

const parseIntent = async (query: string): Promise<AiIntent> => {
  const intentMode = String(process.env.AI_INTENT_MODE || "fast").toLowerCase();
  if (intentMode === "fast") {
    return parseIntentFallback(query);
  }
  const system = `Anda hanya keluarkan JSON SAHAJA. Tugas: kenalpasti intent carian dan entiti.\n` +
    `Format WAJIB:\n` +
    `{"intent":"search_person","entities":{"name":null,"ic":null,"account_no":null,"phone":null,"address":null},"need_nearest_branch":false}\n` +
    `Jika IC/MyKad ada, isi "ic". Jika akaun, isi "account_no". Jika nombor telefon, isi "phone".`;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: query },
  ];
  try {
    const raw = await ollamaChat(messages, { num_predict: 160, temperature: 0.1, top_p: 0.9 });
    const parsed = extractJsonObject(raw);
    if (parsed && parsed.intent && parsed.entities) {
      return {
        intent: String(parsed.intent || "search_person"),
        entities: {
          name: parsed.entities?.name ?? null,
          ic: parsed.entities?.ic ?? null,
          account_no: parsed.entities?.account_no ?? null,
          phone: parsed.entities?.phone ?? null,
          address: parsed.entities?.address ?? null,
        },
        need_nearest_branch: Boolean(parsed.need_nearest_branch),
      };
    }
  } catch {
    // fallback below
  }
  return parseIntentFallback(query);
};

const valueMatches = (value: any, term: string): boolean => {
  if (value === null || value === undefined) return false;
  const termDigits = term.replace(/\D/g, "");
  const valStr = String(value);
  if (termDigits.length >= 6) {
    const valDigits = valStr.replace(/\D/g, "");
    if (valDigits.includes(termDigits)) return true;
  }
  return valStr.toLowerCase().includes(term.toLowerCase());
};

const rowScore = (row: any, ic?: string | null, name?: string | null, account?: string | null, phone?: string | null): number => {
  const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
  let score = 0;
  const icDigits = ic ? ic.replace(/\D/g, "") : "";
  const accountDigits = account ? account.replace(/\D/g, "") : "";
  const phoneDigits = phone ? phone.replace(/\D/g, "") : "";

  const entries = Object.entries(data).slice(0, 80);
  for (const [key, val] of entries) {
    const keyLower = key.toLowerCase();
    const valueStr = String(val ?? "");
    const valueDigits = valueStr.replace(/\D/g, "");

    if (icDigits && valueDigits === icDigits) {
      score += keyLower.includes("ic") ||
        keyLower.includes("mykad") ||
        keyLower.includes("nric") ||
        keyLower.includes("kp") ||
        keyLower.includes("id no") ||
        keyLower.includes("idno")
        ? 20
        : 10;
    }
    if (accountDigits && valueDigits === accountDigits) {
      score += keyLower.includes("akaun") || keyLower.includes("account") ? 12 : 6;
    }
    if (phoneDigits && valueDigits === phoneDigits) {
      score += keyLower.includes("telefon") || keyLower.includes("phone") || keyLower.includes("hp") ? 8 : 4;
    }
    if (name && valueStr.toLowerCase().includes(name.toLowerCase())) {
      score += keyLower.includes("nama") || keyLower.includes("name") ? 6 : 2;
    }
  }

  return score;
};

const scoreRowDigits = (row: any, digits: string): { score: number; parsed: any } => {
  let data = row?.jsonDataJsonb;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = {};
    }
  }
  if (!data || typeof data !== "object") data = {};
  const keyGroups: Array<{ keys: string[]; score: number }> = [
    { keys: ["No. MyKad", "ID No", "No Pengenalan", "IC", "NRIC", "MyKad"], score: 20 },
    { keys: ["Account No", "Account Number", "Card No", "No Akaun", "Nombor Akaun Bank Pemohon"], score: 12 },
    { keys: ["No. Telefon Rumah", "No. Telefon Bimbit", "Phone", "Handphone", "OfficePhone"], score: 8 },
  ];
  let best = 0;
  for (const group of keyGroups) {
    for (const key of group.keys) {
      const val = (data as any)[key];
      if (!val) continue;
      const valueDigits = String(val).replace(/\D/g, "");
      if (valueDigits === digits) {
        best = Math.max(best, group.score);
      }
    }
  }
  return { score: best, parsed: data };
};

const extractLatLng = (data: Record<string, any>): { lat: number; lng: number } | null => {
  const keys = Object.keys(data);
  const findValue = (names: string[]) => {
    const key = keys.find((k) => names.includes(k.toLowerCase()));
    if (!key) return null;
    const val = Number(String(data[key]).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(val) ? val : null;
  };
  const lat = findValue(["lat", "latitude", "latitud"]);
  const lng = findValue(["lng", "long", "longitude", "longitud"]);
  if (lat === null || lng === null) return null;
  return { lat, lng };
};

const buildExplanation = async (payload: {
  decision: string | null;
  distanceKm: number | null;
  branch: string | null;
  personName: string | null;
  personSummary: Array<{ label: string; value: string }>;
  branchSummary: Array<{ label: string; value: string }>;
  estimatedMinutes: number | null;
  travelMode: string | null;
  missingCoords: boolean;
  suggestions?: string[];
  countSummary?: string[] | null;
  matchFields?: string[];
  branchTextSearch?: boolean;
}): Promise<string> => {
  const template = () => {
    if (payload.countSummary && payload.countSummary.length > 0) {
      return payload.countSummary.join("\n");
    }
    const personLines =
      payload.personSummary.length > 0
        ? payload.personSummary.map((i) => `${i.label}: ${i.value}`).join("\n")
        : "Tiada maklumat pelanggan dijumpai.";
    const branchLines =
      payload.branchSummary.length > 0
        ? payload.branchSummary.map((i) => `${i.label}: ${i.value}`).join("\n")
        : payload.missingCoords
          ? "Lokasi pelanggan tidak lengkap (tiada LAT/LNG atau Postcode)."
          : payload.branchTextSearch
            ? "Tiada padanan cawangan ditemui berdasarkan lokasi/teks."
          : "Tiada maklumat cawangan dijumpai.";

    let decisionLine = "Tiada cadangan dibuat.";
    if (payload.decision) {
      const timeInfo = payload.estimatedMinutes ? ` Anggaran masa ${payload.estimatedMinutes} minit.` : "";
      const modeInfo = payload.travelMode ? ` Mod: ${payload.travelMode}.` : "";
      if (payload.distanceKm && payload.branch) {
        decisionLine = `Cadangan: ${payload.decision}. Jarak ke ${payload.branch} adalah ${payload.distanceKm.toFixed(1)}KM.${timeInfo}${modeInfo}`;
      } else {
        decisionLine = `Cadangan: ${payload.decision}.${timeInfo}${modeInfo}`;
      }
    } else if (payload.branchSummary.length > 0) {
      decisionLine = "Cadangan: Sila hubungi/kunjungi cawangan di atas.";
    }

    const base = [
      "Maklumat Pelanggan:",
      personLines,
      "",
      "Cadangan Cawangan Terdekat:",
      branchLines,
      "",
      decisionLine,
    ];

    if (payload.matchFields && payload.matchFields.length > 0) {
      base.push("", "Padanan Medan (Top):", payload.matchFields.join("\n"));
    }

    if (payload.suggestions && payload.suggestions.length > 0) {
      base.push("", "Cadangan Rekod (fuzzy):", payload.suggestions.join("\n"));
    }

    return base.join("\n");
  };

  return template();
};

const searchCache = new Map<string, { ts: number; payload: any; audit: any }>();
const searchInflight = new Map<string, Promise<{ payload: any; audit: any }>>();
const SEARCH_CACHE_MS = 60_000;
const SEARCH_FAST_TIMEOUT_MS = 5500;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((val) => {
        clearTimeout(id);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(id);
        reject(err);
      });
  });
};

const computeAiSearch = async (query: string, userKey: string) => {
  const intent = await parseIntent(query);
  const entities = intent.entities || {};

  const keywordTerms = [
    entities.ic,
    entities.account_no,
    entities.phone,
    entities.name,
  ].filter(Boolean) as string[];

  const keywordQuery = keywordTerms.length > 0 ? keywordTerms[0] : query;
  const digitsOnly = keywordQuery.replace(/[^0-9]/g, "");
  const hasDigitsQuery = digitsOnly.length >= 6;
  const keywordResults = hasDigitsQuery
    ? await storage.aiKeywordSearch({ query: keywordQuery, limit: 10 })
    : await storage.aiNameSearch({ query: keywordQuery, limit: 10 });
  const queryDigits = keywordQuery.replace(/[^0-9]/g, "");
  let fallbackDigitsResults: any[] = [];
  if (keywordResults.length === 0 && queryDigits.length >= 6) {
    fallbackDigitsResults = await storage.aiDigitsSearch({ digits: queryDigits, limit: 25 });
  }

  if (process.env.AI_DEBUG === "1") {
    console.log("🧠 AI_SEARCH DEBUG", {
      query,
      keywordQuery,
      queryDigits,
      keywordCount: keywordResults.length,
      fallbackDigitsCount: fallbackDigitsResults.length,
    });
  }

  let vectorResults: any[] = [];
  const vectorMode = String(process.env.AI_VECTOR_MODE || "off").toLowerCase();
  if (vectorMode === "on" && !hasDigitsQuery) {
    try {
      const embedding = await ollamaEmbed(query);
      if (embedding.length > 0) {
        vectorResults = await storage.semanticSearch({ embedding, limit: 10 });
      }
    } catch (err) {
      vectorResults = [];
    }
  }

  let best: any | null = null;
  let bestScore = 0;

  if (hasDigitsQuery) {
    const candidates = [...keywordResults, ...fallbackDigitsResults];
    for (const row of candidates) {
      const scored = scoreRowDigits(row, queryDigits);
      if (scored.score > bestScore) {
        bestScore = scored.score;
        row.jsonDataJsonb = scored.parsed;
        best = row;
      }
    }
  } else {
    const resultMap = new Map<string, any>();
    for (const row of keywordResults) {
      resultMap.set(row.rowId, row);
    }
    for (const row of fallbackDigitsResults) {
      resultMap.set(row.rowId, row);
    }
    for (const row of vectorResults) {
      resultMap.set(row.rowId, row);
    }

    const combined = Array.from(resultMap.values());
    const ensureJson = (row: any) => {
      if (row?.jsonDataJsonb && typeof row.jsonDataJsonb === "string") {
        try {
          row.jsonDataJsonb = JSON.parse(row.jsonDataJsonb);
        } catch {
          // keep as string
        }
      }
      return row;
    };
    const scored = combined
      .map((row) => {
        const normalized = ensureJson(row);
        return {
          row: normalized,
          score: rowScore(normalized, entities.ic, entities.name, entities.account_no, entities.phone),
        };
      })
      .sort((a, b) => b.score - a.score);

    best = scored.length > 0 ? scored[0].row : null;
    bestScore = scored.length > 0 ? scored[0].score : 0;
  }

  if (process.env.AI_DEBUG === "1" && best) {
    const keys = best.jsonDataJsonb && typeof best.jsonDataJsonb === "object"
      ? Object.keys(best.jsonDataJsonb)
      : [];
    console.log("🧠 AI_SEARCH BEST ROW", {
      rowId: best.rowId,
      jsonType: typeof best.jsonDataJsonb,
      sampleKeys: keys.slice(0, 10),
    });
  }

  if (best) {
    (global as any).__lastAiPerson = (global as any).__lastAiPerson || new Map();
    (global as any).__lastAiPerson.set(userKey, best);
  }

  const lastPersonMap: Map<string, any> | undefined = (global as any).__lastAiPerson;
  const fallbackPerson = lastPersonMap?.get(userKey);
  const hasPersonId = Boolean(entities.ic || entities.account_no || entities.phone);
  const shouldFindBranch = intent.need_nearest_branch || hasPersonId;
  const branchTextPreferred = shouldFindBranch && !hasPersonId;
  const personForBranch = branchTextPreferred ? null : (best || fallbackPerson || null);
  const normalizeLocationHint = (value: string) =>
    value.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();

  let nearestBranch: any | null = null;
  let missingCoords = false;
  let branchTextSearch = false;
  if (branchTextPreferred) {
    const locationHint = normalizeLocationHint(query
      .replace(/cawangan|branch|terdekat|nearest|lokasi|alamat|di|yang|paling|dekat/gi, " ")
    );
    if (locationHint.length >= 3) {
      branchTextSearch = true;
      const branches = await storage.findBranchesByText({ query: locationHint, limit: 3 });
      nearestBranch = branches[0] || null;
    } else {
      branchTextSearch = true;
    }
        } else if (personForBranch && shouldFindBranch) {
          const coords = extractLatLng(personForBranch.jsonDataJsonb || {});
          if (coords) {
            const branches = await storage.getNearestBranches({ lat: coords.lat, lng: coords.lng, limit: 1 });
            nearestBranch = branches[0] || null;
          } else {
            const data = personForBranch.jsonDataJsonb || {};
            const postcode =
              data["Poskod"] ||
              data["Postcode"] ||
              data["Postal Code"] ||
              data["HomePostcode"] ||
              data["OfficePostcode"] ||
              null;
          if (postcode) {
            const postcodeDigits = String(postcode).match(/\d{5}/)?.[0] || null;
            if (postcodeDigits) {
              const pc = await storage.getPostcodeLatLng(postcodeDigits);
              if (pc) {
                const branches = await storage.getNearestBranches({ lat: pc.lat, lng: pc.lng, limit: 1 });
                nearestBranch = branches[0] || null;
              } else {
                missingCoords = true;
                branchTextSearch = true;
                const branches = await storage.findBranchesByText({ query: postcodeDigits, limit: 1 });
                nearestBranch = branches[0] || null;
              }
            } else {
              missingCoords = true;
            }
          } else {
            missingCoords = true;
          }

          if (!nearestBranch && missingCoords) {
            const city = data["Bandar"] || data["City"] || data["City/Town"] || null;
            const state = data["Negeri"] || data["State"] || null;
            const address =
              data["Alamat Surat Menyurat"] ||
              data["HomeAddress1"] ||
              data["OfficeAddress1"] ||
              data["Address"] ||
              null;
            const hint = normalizeLocationHint([city, state, address].filter(Boolean).join(" "));
            if (hint.length >= 3) {
              branchTextSearch = true;
              const branches = await storage.findBranchesByText({ query: hint, limit: 1 });
              nearestBranch = branches[0] ? { ...branches[0], distanceKm: undefined } : null;
            }
          }
        }
      }

  let decision: string | null = null;
  let travelMode: string | null = null;
  let estimatedMinutes: number | null = null;
  if (nearestBranch?.distanceKm !== undefined) {
    if (nearestBranch.distanceKm < 5) {
      decision = "WALK-IN";
      travelMode = "WALK";
      estimatedMinutes = Math.max(1, Math.round((nearestBranch.distanceKm / 5) * 60));
    } else if (nearestBranch.distanceKm < 20) {
      decision = "DRIVE";
      travelMode = "DRIVE";
      estimatedMinutes = Math.max(1, Math.round((nearestBranch.distanceKm / 40) * 60));
    }
    else decision = "CALL";
    if (decision === "CALL") {
      travelMode = "CALL";
      estimatedMinutes = null;
    }
  }

  const person = best
    ? {
        id: best.rowId,
        ...best.jsonDataJsonb,
      }
    : null;

  let suggestions: string[] = [];
  if ((!person || bestScore < 6) && !hasDigitsQuery) {
    const fuzzyResults = await storage.aiFuzzySearch({ query, limit: 5 });
    const tokens = tokenizeQuery(query);
    const maxScore = Math.max(1, tokens.length);
    suggestions = fuzzyResults.map((row) => {
      let data = row.jsonDataJsonb;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          data = {};
        }
      }
      if (!data || typeof data !== "object") data = {};
      const name = data["Nama"] || data["Customer Name"] || data["name"] || "-";
      const ic = data["No. MyKad"] || data["ID No"] || data["No Pengenalan"] || data["IC"] || "-";
      const addr =
        data["Alamat Surat Menyurat"] ||
        data["HomeAddress1"] ||
        data["Address"] ||
        data["Alamat"] ||
        "-";
      const confidence = Math.min(100, Math.round((Number(row.score || 0) / maxScore) * 100));
      const hasAny = [name, ic, addr].some((v) => v && v !== "-" && String(v).trim() !== "");
      return hasAny
        ? `• ${name} | IC: ${ic} | Alamat: ${addr} | Keyakinan: ${confidence}%`
        : "";
    }).filter(Boolean);
  }

  const personSummary: Array<{ label: string; value: string }> = [];
  if (person && typeof person === "object") {
    const pushIf = (label: string, key: string) => {
      const val = (person as any)[key];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        personSummary.push({ label, value: String(val) });
      }
    };
    pushIf("Nama", "Nama");
    pushIf("Nama", "Customer Name");
    pushIf("Nama", "name");
    pushIf("No. MyKad", "No. MyKad");
    pushIf("ID No", "ID No");
    pushIf("No Pengenalan", "No Pengenalan");
    pushIf("IC", "ic");
    pushIf("Account No", "Account No");
    pushIf("Card No", "Card No");
    pushIf("No. Telefon Rumah", "No. Telefon Rumah");
    pushIf("No. Telefon Bimbit", "No. Telefon Bimbit");
    pushIf("Handphone", "Handphone");
    pushIf("OfficePhone", "OfficePhone");
    pushIf("Alamat Surat Menyurat", "Alamat Surat Menyurat");
    pushIf("HomeAddress1", "HomeAddress1");
    pushIf("HomeAddress2", "HomeAddress2");
    pushIf("HomeAddress3", "HomeAddress3");
    pushIf("Bandar", "Bandar");
    pushIf("Negeri", "Negeri");
    pushIf("Poskod", "Poskod");
  }

  if (personSummary.length === 0 && person && typeof person === "object") {
    const entries = Object.entries(person as any).filter(([k]) => k !== "id").slice(0, 8);
    for (const [k, v] of entries) {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        personSummary.push({ label: k, value: String(v) });
      }
    }
  }

  const branchSummary: Array<{ label: string; value: string }> = [];
  if (nearestBranch) {
    const push = (label: string, value: any) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        branchSummary.push({ label, value: String(value) });
      }
    };
    push("Nama Cawangan", nearestBranch.name);
    push("Alamat", nearestBranch.address);
    push("Telefon", nearestBranch.phone);
    push("Fax", nearestBranch.fax);
    push("Business Hour", nearestBranch.businessHour);
    push("Day Open", nearestBranch.dayOpen);
    push("ATM & CDM", nearestBranch.atmCdm);
    push("Inquiry Availability", nearestBranch.inquiryAvailability);
    push("Application Availability", nearestBranch.applicationAvailability);
    push("AEON Lounge", nearestBranch.aeonLounge);
    push("Jarak (KM)", nearestBranch.distanceKm);
  }

  const explanation = await buildExplanation({
    decision,
    distanceKm: nearestBranch?.distanceKm ?? null,
    branch: nearestBranch?.name ?? null,
    personName: person?.Nama || person?.name || null,
    personSummary,
    branchSummary,
    estimatedMinutes,
    travelMode,
    missingCoords,
    suggestions,
    countSummary: null,
    matchFields: !hasDigitsQuery && person && typeof person === "object" ? buildFieldMatchSummary(person, query) : [],
    branchTextSearch,
  });

  const responsePayload = {
    person,
    nearest_branch: nearestBranch
      ? {
          name: nearestBranch.name,
          address: nearestBranch.address,
          phone: nearestBranch.phone,
          fax: nearestBranch.fax,
          business_hour: nearestBranch.businessHour,
          day_open: nearestBranch.dayOpen,
          atm_cdm: nearestBranch.atmCdm,
          inquiry_availability: nearestBranch.inquiryAvailability,
          application_availability: nearestBranch.applicationAvailability,
          aeon_lounge: nearestBranch.aeonLounge,
          distance_km: nearestBranch.distanceKm,
          travel_mode: travelMode,
          estimated_minutes: estimatedMinutes,
        }
      : null,
    decision,
    ai_explanation: explanation,
  };

  const audit = {
    query,
    intent,
    matched_profile_id: person?.id || null,
    branch: nearestBranch?.name || null,
    distance_km: nearestBranch?.distanceKm || null,
    decision,
    travel_mode: travelMode,
    estimated_minutes: estimatedMinutes,
    used_last_person: !best && !!fallbackPerson,
  };

  return { payload: responsePayload, audit };
};

app.post(
  "/api/ai/search",
  authenticateToken,
  requireRole("user", "admin", "superuser"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const query = String(req.body?.query || "").trim();
      if (!query) {
        return res.status(400).json({ message: "Query required" });
      }

      const rules = await loadCategoryRules();
      const countGroups = detectCountRequest(query, rules);
      if (countGroups) {
        const keys = [...countGroups.map((g) => g.key), "__all__"];
        const rulesUpdatedAt = await storage.getCategoryRulesMaxUpdatedAt();
        let statsRows = await storage.getCategoryStats(keys);
        let statsMap = new Map(statsRows.map((row) => [row.key, row]));
        let totalRow = statsMap.get("__all__");
        const statsUpdatedAt = totalRow?.updatedAt ?? null;
        const missingKeys = keys.filter((k) => !statsMap.get(k));
        const staleStats = Boolean(rulesUpdatedAt && statsUpdatedAt && rulesUpdatedAt > statsUpdatedAt);

        if (!totalRow || missingKeys.length > 0 || staleStats) {
          const computeKeys = staleStats ? keys : Array.from(new Set([...missingKeys, "__all__"]));
          let readyNow = false;
          try {
            await withTimeout(storage.computeCategoryStatsForKeys(computeKeys, rules), 12000);
            statsRows = await storage.getCategoryStats(keys);
            statsMap = new Map(statsRows.map((row) => [row.key, row]));
            totalRow = statsMap.get("__all__");
            readyNow = Boolean(totalRow && keys.every((k) => statsMap.has(k)));
          } catch {
            readyNow = false;
          }
          if (!readyNow) {
            enqueueCategoryStatsCompute(computeKeys, rules);
            return res.json({
              person: null,
              nearest_branch: null,
              decision: null,
              ai_explanation: "Statistik sedang disediakan. Sila cuba semula dalam 10-20 saat.",
              processing: true,
            });
          }
        }
        const summaryLines = [
          "Ringkasan Statistik (berdasarkan data import):",
          `Jumlah rekod dianalisis: ${totalRow?.total ?? 0}`,
        ];
        for (const group of countGroups) {
          const row = statsMap.get(group.key);
          const count = row?.total ?? 0;
          summaryLines.push(`- ${group.key}: ${count}`);
            if (row?.samples?.length) {
              summaryLines.push("  Contoh rekod:");
              for (const sample of row.samples.slice(0, 10)) {
                const source = sample.source ? ` (${sample.source})` : "";
                summaryLines.push(`  • ${sample.name} | IC: ${sample.ic}${source}`);
              }
            }
        }
        const explanation = summaryLines.join("\n");
        return res.json({
          person: null,
          nearest_branch: null,
          decision: null,
          ai_explanation: explanation,
          stats: statsRows,
        });
      }

      const cacheKey = `search:${query.toLowerCase()}`;
      const cached = searchCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < SEARCH_CACHE_MS) {
        setTimeout(() => {
          storage.createAuditLog({
            action: "AI_SEARCH",
            performedBy: req.user!.username,
            targetResource: "ai_search",
            details: JSON.stringify(cached.audit),
          }).catch((err) => {
            console.error("Audit log failed:", err?.message || err);
          });
        }, 0);
        return res.json(cached.payload);
      }

      let inflight = searchInflight.get(cacheKey);
      if (!inflight) {
        inflight = computeAiSearch(query, req.user!.activityId || req.user!.username)
          .then((result) => {
            searchCache.set(cacheKey, { ts: Date.now(), payload: result.payload, audit: result.audit });
            searchInflight.delete(cacheKey);
            return result;
          })
          .catch((err) => {
            searchInflight.delete(cacheKey);
            throw err;
          });
        searchInflight.set(cacheKey, inflight);
      }

      try {
        const result = await withTimeout(inflight, SEARCH_FAST_TIMEOUT_MS);
        setTimeout(() => {
          storage.createAuditLog({
            action: "AI_SEARCH",
            performedBy: req.user!.username,
            targetResource: "ai_search",
            details: JSON.stringify(result.audit),
          }).catch((err) => {
            console.error("Audit log failed:", err?.message || err);
          });
        }, 0);
        return res.json(result.payload);
      } catch {
        return res.json({
          person: null,
          nearest_branch: null,
          decision: null,
          ai_explanation: "Sedang proses carian. Sila tunggu beberapa saat dan cuba semula.",
          processing: true,
        });
      }

      const intent = await parseIntent(query);
      const entities = intent.entities || {};

      const keywordTerms = [
        entities.ic,
        entities.account_no,
        entities.phone,
        entities.name,
      ].filter(Boolean) as string[];

      const keywordQuery = keywordTerms.length > 0 ? keywordTerms[0] : query;
      const digitsOnly = keywordQuery.replace(/[^0-9]/g, "");
      const hasDigitsQuery = digitsOnly.length >= 6;
      const keywordResults = hasDigitsQuery
        ? await storage.aiKeywordSearch({ query: keywordQuery, limit: 10 })
        : await storage.aiNameSearch({ query: keywordQuery, limit: 10 });
      const queryDigits = keywordQuery.replace(/[^0-9]/g, "");
      let fallbackDigitsResults: any[] = [];
      if (keywordResults.length === 0 && queryDigits.length >= 6) {
        fallbackDigitsResults = await storage.aiDigitsSearch({ digits: queryDigits, limit: 25 });
      }

      if (process.env.AI_DEBUG === "1") {
        console.log("🧠 AI_SEARCH DEBUG", {
          query,
          keywordQuery,
          queryDigits,
          keywordCount: keywordResults.length,
          fallbackDigitsCount: fallbackDigitsResults.length,
        });
      }

      let vectorResults: any[] = [];
      const vectorMode = String(process.env.AI_VECTOR_MODE || "off").toLowerCase();
      if (vectorMode === "on" && !hasDigitsQuery) {
        try {
          const embedding = await ollamaEmbed(query);
          if (embedding.length > 0) {
            vectorResults = await storage.semanticSearch({ embedding, limit: 10 });
          }
        } catch (err) {
          vectorResults = [];
        }
      }

      let best: any | null = null;
      let bestScore = 0;

      if (hasDigitsQuery) {
        const candidates = [...keywordResults, ...fallbackDigitsResults];
        for (const row of candidates) {
          const scored = scoreRowDigits(row, queryDigits);
          if (scored.score > bestScore) {
            bestScore = scored.score;
            row.jsonDataJsonb = scored.parsed;
            best = row;
          }
        }
      } else {
        const resultMap = new Map<string, any>();
        for (const row of keywordResults) {
          resultMap.set(row.rowId, row);
        }
        for (const row of fallbackDigitsResults) {
          resultMap.set(row.rowId, row);
        }
        for (const row of vectorResults) {
          resultMap.set(row.rowId, row);
        }

        const combined = Array.from(resultMap.values());
        const ensureJson = (row: any) => {
          if (row?.jsonDataJsonb && typeof row.jsonDataJsonb === "string") {
            try {
              row.jsonDataJsonb = JSON.parse(row.jsonDataJsonb);
            } catch {
              // keep as string
            }
          }
          return row;
        };
        const scored = combined
          .map((row) => {
            const normalized = ensureJson(row);
            return {
              row: normalized,
              score: rowScore(normalized, entities.ic, entities.name, entities.account_no, entities.phone),
            };
          })
          .sort((a, b) => b.score - a.score);

        best = scored.length > 0 ? scored[0].row : null;
        bestScore = scored.length > 0 ? scored[0].score : 0;
      }
      if (process.env.AI_DEBUG === "1" && best) {
        const keys = best.jsonDataJsonb && typeof best.jsonDataJsonb === "object"
          ? Object.keys(best.jsonDataJsonb)
          : [];
        console.log("🧠 AI_SEARCH BEST ROW", {
          rowId: best.rowId,
          jsonType: typeof best.jsonDataJsonb,
          sampleKeys: keys.slice(0, 10),
        });
      }
      const userKey = req.user?.activityId || req.user?.username || "unknown";
      if (best) {
        (global as any).__lastAiPerson = (global as any).__lastAiPerson || new Map();
        (global as any).__lastAiPerson.set(userKey, best);
      }

      const lastPersonMap: Map<string, any> | undefined = (global as any).__lastAiPerson;
      const fallbackPerson = lastPersonMap?.get(userKey);
      const hasPersonId = Boolean(entities.ic || entities.account_no || entities.phone);
      const shouldFindBranch = intent.need_nearest_branch || hasPersonId;
      const branchTextPreferred = shouldFindBranch && !hasPersonId;
      const personForBranch = branchTextPreferred ? null : (best || fallbackPerson || null);
      const normalizeLocationHint = (value: string) =>
        value.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();

      let nearestBranch: any | null = null;
      let missingCoords = false;
      let branchTextSearch = false;
      if (branchTextPreferred) {
        const locationHint = normalizeLocationHint(query
          .replace(/cawangan|branch|terdekat|nearest|lokasi|alamat|di|yang|paling|dekat/gi, " ")
        );
        if (locationHint.length >= 3) {
          branchTextSearch = true;
          const branches = await storage.findBranchesByText({ query: locationHint, limit: 3 });
          nearestBranch = branches[0] || null;
        } else {
          branchTextSearch = true;
        }
      } else if (personForBranch && shouldFindBranch) {
        const coords = extractLatLng(personForBranch.jsonDataJsonb || {});
        if (coords) {
          const branches = await storage.getNearestBranches({ lat: coords.lat, lng: coords.lng, limit: 1 });
          nearestBranch = branches[0] || null;
        } else {
          const data = personForBranch.jsonDataJsonb || {};
          const postcode =
            data["Poskod"] ||
            data["Postcode"] ||
            data["Postal Code"] ||
            data["HomePostcode"] ||
            data["OfficePostcode"] ||
            null;
          if (postcode) {
            const postcodeDigits = String(postcode).match(/\d{5}/)?.[0] || null;
            if (postcodeDigits) {
              const pc = await storage.getPostcodeLatLng(postcodeDigits);
              if (pc) {
                const branches = await storage.getNearestBranches({ lat: pc.lat, lng: pc.lng, limit: 1 });
                nearestBranch = branches[0] || null;
              } else {
                missingCoords = true;
                branchTextSearch = true;
                const branches = await storage.findBranchesByText({ query: postcodeDigits, limit: 1 });
                nearestBranch = branches[0] || null;
              }
            } else {
              missingCoords = true;
            }
          } else {
            missingCoords = true;
          }

          if (!nearestBranch && missingCoords) {
            const city = data["Bandar"] || data["City"] || data["City/Town"] || null;
            const state = data["Negeri"] || data["State"] || null;
            const address =
              data["Alamat Surat Menyurat"] ||
              data["HomeAddress1"] ||
              data["OfficeAddress1"] ||
              data["Address"] ||
              null;
            const hint = normalizeLocationHint([city, state, address].filter(Boolean).join(" "));
            if (hint.length >= 3) {
              branchTextSearch = true;
              const branches = await storage.findBranchesByText({ query: hint, limit: 1 });
              nearestBranch = branches[0] ? { ...branches[0], distanceKm: undefined } : null;
            }
          }
        }
      }

      let decision: string | null = null;
      let travelMode: string | null = null;
      let estimatedMinutes: number | null = null;
      if (nearestBranch?.distanceKm !== undefined) {
        if (nearestBranch.distanceKm < 5) {
          decision = "WALK-IN";
          travelMode = "WALK";
          estimatedMinutes = Math.max(1, Math.round((nearestBranch.distanceKm / 5) * 60));
        } else if (nearestBranch.distanceKm < 20) {
          decision = "DRIVE";
          travelMode = "DRIVE";
          estimatedMinutes = Math.max(1, Math.round((nearestBranch.distanceKm / 40) * 60));
        }
        else decision = "CALL";
        if (decision === "CALL") {
          travelMode = "CALL";
          estimatedMinutes = null;
        }
      }

      const person = best
        ? {
            id: best.rowId,
            ...best.jsonDataJsonb,
          }
        : null;

      let suggestions: string[] = [];
      if ((!person || bestScore < 6) && !hasDigitsQuery) {
        const fuzzyResults = await storage.aiFuzzySearch({ query, limit: 5 });
        const tokens = tokenizeQuery(query);
        const maxScore = Math.max(1, tokens.length);
        suggestions = fuzzyResults.map((row) => {
          let data = row.jsonDataJsonb;
          if (typeof data === "string") {
            try {
              data = JSON.parse(data);
            } catch {
              data = {};
            }
          }
          if (!data || typeof data !== "object") data = {};
          const name = data["Nama"] || data["Customer Name"] || data["name"] || "-";
          const ic = data["No. MyKad"] || data["ID No"] || data["No Pengenalan"] || data["IC"] || "-";
          const addr =
            data["Alamat Surat Menyurat"] ||
            data["HomeAddress1"] ||
            data["Address"] ||
            data["Alamat"] ||
            "-";
          const confidence = Math.min(100, Math.round((Number(row.score || 0) / maxScore) * 100));
          const hasAny = [name, ic, addr].some((v) => v && v !== "-" && String(v).trim() !== "");
          return hasAny
            ? `• ${name} | IC: ${ic} | Alamat: ${addr} | Keyakinan: ${confidence}%`
            : "";
        }).filter(Boolean);
      }

      const personSummary: Array<{ label: string; value: string }> = [];
      if (person && typeof person === "object") {
        const pushIf = (label: string, key: string) => {
          const val = (person as any)[key];
          if (val !== undefined && val !== null && String(val).trim() !== "") {
            personSummary.push({ label, value: String(val) });
          }
        };
        pushIf("Nama", "Nama");
        pushIf("Nama", "Customer Name");
        pushIf("Nama", "name");
        pushIf("No. MyKad", "No. MyKad");
        pushIf("ID No", "ID No");
        pushIf("No Pengenalan", "No Pengenalan");
        pushIf("IC", "ic");
        pushIf("Account No", "Account No");
        pushIf("Card No", "Card No");
        pushIf("No. Telefon Rumah", "No. Telefon Rumah");
        pushIf("No. Telefon Bimbit", "No. Telefon Bimbit");
        pushIf("Handphone", "Handphone");
        pushIf("OfficePhone", "OfficePhone");
        pushIf("Alamat Surat Menyurat", "Alamat Surat Menyurat");
        pushIf("HomeAddress1", "HomeAddress1");
        pushIf("HomeAddress2", "HomeAddress2");
        pushIf("HomeAddress3", "HomeAddress3");
        pushIf("Bandar", "Bandar");
        pushIf("Negeri", "Negeri");
        pushIf("Poskod", "Poskod");
      }

      if (personSummary.length === 0 && person && typeof person === "object") {
        const entries = Object.entries(person as any).filter(([k]) => k !== "id").slice(0, 8);
        for (const [k, v] of entries) {
          if (v !== undefined && v !== null && String(v).trim() !== "") {
            personSummary.push({ label: k, value: String(v) });
          }
        }
      }

      const branchSummary: Array<{ label: string; value: string }> = [];
      if (nearestBranch) {
        const push = (label: string, value: any) => {
          if (value !== undefined && value !== null && String(value).trim() !== "") {
            branchSummary.push({ label, value: String(value) });
          }
        };
        push("Nama Cawangan", nearestBranch.name);
        push("Alamat", nearestBranch.address);
        push("Telefon", nearestBranch.phone);
        push("Fax", nearestBranch.fax);
        push("Business Hour", nearestBranch.businessHour);
        push("Day Open", nearestBranch.dayOpen);
        push("ATM & CDM", nearestBranch.atmCdm);
        push("Inquiry Availability", nearestBranch.inquiryAvailability);
        push("Application Availability", nearestBranch.applicationAvailability);
        push("AEON Lounge", nearestBranch.aeonLounge);
        push("Jarak (KM)", nearestBranch.distanceKm);
      }

      const explanation = await buildExplanation({
        decision,
        distanceKm: nearestBranch?.distanceKm ?? null,
        branch: nearestBranch?.name ?? null,
        personName: person?.Nama || person?.name || null,
        personSummary,
        branchSummary,
        estimatedMinutes,
        travelMode,
        missingCoords,
        suggestions,
        countSummary: null,
        matchFields: !hasDigitsQuery && person && typeof person === "object" ? buildFieldMatchSummary(person, query) : [],
        branchTextSearch,
      });

      const responsePayload = {
        person,
        nearest_branch: nearestBranch
          ? {
              name: nearestBranch.name,
              address: nearestBranch.address,
              phone: nearestBranch.phone,
              fax: nearestBranch.fax,
              business_hour: nearestBranch.businessHour,
              day_open: nearestBranch.dayOpen,
              atm_cdm: nearestBranch.atmCdm,
              inquiry_availability: nearestBranch.inquiryAvailability,
              application_availability: nearestBranch.applicationAvailability,
              aeon_lounge: nearestBranch.aeonLounge,
              distance_km: nearestBranch.distanceKm,
              travel_mode: travelMode,
              estimated_minutes: estimatedMinutes,
            }
          : null,
        decision,
        ai_explanation: explanation,
      };

      setTimeout(() => {
        storage.createAuditLog({
          action: "AI_SEARCH",
          performedBy: req.user!.username,
          targetResource: "ai_search",
          details: JSON.stringify({
            query,
            intent,
            matched_profile_id: person?.id || null,
            branch: nearestBranch?.name || null,
            distance_km: nearestBranch?.distanceKm || null,
            decision,
            travel_mode: travelMode,
            estimated_minutes: estimatedMinutes,
            used_last_person: !best && !!fallbackPerson,
          }),
        }).catch((err) => {
          console.error("Audit log failed:", err?.message || err);
        });
      }, 0);

      return res.json(responsePayload);
    } catch (error: any) {
      console.error("AI search error:", error);
      return res.status(500).json({ message: error.message });
    }
  }
);

app.post(
  "/api/ai/index/import/:id",
  authenticateToken,
  requireRole("user", "admin", "superuser"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const importId = req.params.id;
      const importRecord = await storage.getImportById(importId);
      if (!importRecord) {
        return res.status(404).json({ message: "Import not found" });
      }

      const batchSize = Math.max(1, Math.min(20, Number(req.body?.batchSize ?? 5)));
      const maxRows = req.body?.maxRows ? Math.max(1, Number(req.body.maxRows)) : null;
      const totalRows = await storage.getDataRowCountByImport(importId);
      const targetTotal = maxRows ? Math.min(maxRows, totalRows) : totalRows;

      let processed = 0;
      let offset = 0;

      while (processed < targetTotal) {
        const rows = await storage.getDataRowsForEmbedding(importId, batchSize, offset);
        if (!rows.length) break;
        for (const row of rows) {
          if (processed >= targetTotal) break;
          const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
          const content = buildEmbeddingText(data);
          if (!content) {
            processed += 1;
            continue;
          }
          const embedding = await ollamaEmbed(content);
          if (!embedding.length) {
            processed += 1;
            continue;
          }
          await storage.saveEmbedding({
            importId,
            rowId: row.id,
            content,
            embedding,
          });
          processed += 1;
        }
        offset += rows.length;
      }

      await storage.createAuditLog({
        action: "AI_INDEX_IMPORT",
        performedBy: req.user!.username,
        targetResource: importRecord.name,
        details: `Indexed ${processed}/${targetTotal} rows`,
      });

      return res.json({ success: true, processed, total: targetTotal });
    } catch (error: any) {
      console.error("AI index error:", error);
      return res.status(500).json({ message: error.message });
    }
  }
);

app.post(
  "/api/ai/branches/import/:id",
  authenticateToken,
  requireRole("user", "admin", "superuser"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const importId = req.params.id;
      const importRecord = await storage.getImportById(importId);
      if (!importRecord) {
        return res.status(404).json({ message: "Import not found" });
      }

      const result = await storage.importBranchesFromRows({
        importId,
        nameKey: req.body?.nameKey || null,
        latKey: req.body?.latKey || null,
        lngKey: req.body?.lngKey || null,
      });

      await storage.createAuditLog({
        action: "IMPORT_BRANCHES",
        performedBy: req.user!.username,
        targetResource: importRecord.name,
        details: JSON.stringify({ inserted: result.inserted, skipped: result.skipped, usedKeys: result.usedKeys }),
      });

      return res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Branch import error:", error);
      return res.status(500).json({ message: error.message });
    }
  }
);

app.post(
  "/api/ai/chat",
  authenticateToken,
  requireRole("user", "admin", "superuser"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const message = String(req.body?.message || "").trim();
      if (!message) {
        return res.status(400).json({ message: "Message required" });
      }

      const extractKeywords = (text: string): string[] => {
        const raw = text.toLowerCase();
        const digitMatches = raw.match(/\d{4,}/g) || [];
        const wordMatches = raw.match(/\b[a-z0-9]{4,}\b/gi) || [];
        const combined = [...digitMatches, ...wordMatches]
          .map((t) => t.replace(/[^a-z0-9]/gi, ""))
          .filter((t) => t.length >= 4);
        const unique = Array.from(new Set(combined));
        unique.sort((a, b) => b.length - a.length);
        return unique.slice(0, 4);
      };

      const valueMatchesTerm = (value: any, term: string): boolean => {
        if (value === null || value === undefined) return false;
        const termLower = term.toLowerCase();
        const termDigits = term.replace(/\D/g, "");
        const asString = String(value);
        if (termDigits.length >= 6) {
          const valueDigits = asString.replace(/\D/g, "");
          if (valueDigits.includes(termDigits)) return true;
        }
        return asString.toLowerCase().includes(termLower);
      };

      const rowMatchesTerm = (row: any, term: string): boolean => {
        const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
        for (const val of Object.values(data)) {
          if (valueMatchesTerm(val, term)) return true;
        }
        return false;
      };

      const scoreRowForTerm = (row: any, term: string): number => {
        const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
        const termDigits = term.replace(/\D/g, "");
        let score = 0;
        for (const [key, val] of Object.entries(data)) {
          const keyLower = key.toLowerCase();
          const valueStr = String(val ?? "");
          const valueDigits = valueStr.replace(/\D/g, "");
          if (!termDigits) {
            if (valueStr.toLowerCase().includes(term.toLowerCase())) {
              score += 2;
            }
            continue;
          }
          if (valueDigits === termDigits) {
            if (keyLower.includes("ic") || keyLower.includes("mykad") || keyLower.includes("nric") || keyLower.includes("kp")) {
              score += 10;
            } else {
              score += 6;
            }
          } else if (valueDigits.includes(termDigits)) {
            score += 3;
          }
        }
        return score;
      };

      const existingConversationId = req.body?.conversationId
        ? String(req.body.conversationId)
        : null;

      const conversationId = existingConversationId || await storage.createConversation(req.user!.username);
      const history = await storage.getConversationMessages(conversationId, 3);

      // Fast path: category count queries (no LLM).
      const countRules = await loadCategoryRules();
      const countGroups = detectCountRequest(message, countRules);
      if (countGroups) {
        const keys = [...countGroups.map((g) => g.key), "__all__"];
        const rulesUpdatedAt = await storage.getCategoryRulesMaxUpdatedAt();
        let statsRows = await storage.getCategoryStats(keys);
        let statsMap = new Map(statsRows.map((row) => [row.key, row]));
        let totalRow = statsMap.get("__all__");
        const statsUpdatedAt = totalRow?.updatedAt ?? null;
        const missingKeys = keys.filter((k) => !statsMap.get(k));
        const staleStats = Boolean(rulesUpdatedAt && statsUpdatedAt && rulesUpdatedAt > statsUpdatedAt);

        if (!totalRow || missingKeys.length > 0 || staleStats) {
          const computeKeys = staleStats ? keys : Array.from(new Set([...missingKeys, "__all__"]));
          let readyNow = false;
          try {
            await withTimeout(storage.computeCategoryStatsForKeys(computeKeys, countRules), 12000);
            statsRows = await storage.getCategoryStats(keys);
            statsMap = new Map(statsRows.map((row) => [row.key, row]));
            totalRow = statsMap.get("__all__");
            readyNow = Boolean(totalRow && keys.every((k) => statsMap.has(k)));
          } catch {
            readyNow = false;
          }
          if (!readyNow) {
            enqueueCategoryStatsCompute(computeKeys, countRules);
            const pendingReply = "Statistik sedang disediakan. Sila cuba semula dalam 10-20 saat.";
            await storage.saveConversationMessage(conversationId, "user", message);
            await storage.saveConversationMessage(conversationId, "assistant", pendingReply);
            return res.json({ conversationId, reply: pendingReply, processing: true });
          }
        }

        const summaryLines = [
          "Ringkasan Statistik (berdasarkan data import):",
          `Jumlah rekod dianalisis: ${totalRow?.total ?? 0}`,
        ];
        for (const group of countGroups) {
          const row = statsMap.get(group.key);
          const count = row?.total ?? 0;
          summaryLines.push(`- ${group.key}: ${count}`);
          if (row?.samples?.length) {
            summaryLines.push("  Contoh rekod:");
            for (const sample of row.samples.slice(0, 10)) {
              const source = sample.source ? ` (${sample.source})` : "";
              summaryLines.push(`  • ${sample.name} | IC: ${sample.ic}${source}`);
            }
          }
        }
        const reply = summaryLines.join("\n");

        await storage.saveConversationMessage(conversationId, "user", message);
        await storage.saveConversationMessage(conversationId, "assistant", reply);
        await storage.createAuditLog({
          action: "AI_CHAT",
          performedBy: req.user!.username,
          details: `Conversation=${conversationId}`,
        });

        return res.json({ conversationId, reply, stats: statsRows });
      }

      // Keyword-based retrieval from system data (no pgvector)
      const keywords = extractKeywords(message);
      const searchTerms = keywords.length ? keywords : [message];
      const resultMap = new Map<string, any>();

      for (const term of searchTerms) {
        const retrieval = await storage.searchGlobalDataRows({
          search: term,
          limit: 30,
          offset: 0,
        });
        for (const row of retrieval.rows || []) {
          if (!resultMap.has(row.id)) {
            resultMap.set(row.id, row);
          }
        }
        if (resultMap.size >= 60) break;
      }

      const allRows = Array.from(resultMap.values());
      const matchedRows = allRows.filter((row) => searchTerms.some((term) => rowMatchesTerm(row, term)));
      const scored = (matchedRows.length > 0 ? matchedRows : allRows)
        .map((row) => ({
          row,
          score: Math.max(...searchTerms.map((term) => scoreRowForTerm(row, term))),
        }))
        .sort((a, b) => b.score - a.score);
      const retrievalRows = scored.map((s) => s.row).slice(0, 5);

      const contextRows = (retrievalRows || []).map((row: any, idx: number) => {
        const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
        const entries = Object.entries(data).slice(0, 20);
        const lines = entries.map(([key, val]) => `${key}: ${String(val ?? "")}`);
        const source = row.importFilename || row.importName || "Unknown";
        return `# Rekod ${idx + 1} (Source: ${source}, RowId: ${row.id || row.rowId || "unknown"})\n${lines.join("\n")}`;
      });

      const buildQuickReply = (): string => {
        if (retrievalRows.length === 0) {
          return "Tiada data dijumpai untuk kata kunci tersebut.";
        }
        const priorityKeys = [
          "nama", "name", "no. mykad", "mykad", "ic", "no. ic", "nric", "no. kp", "akaun", "account",
          "telefon", "phone", "hp", "alamat", "address", "umur", "age",
        ];
        const summaries = retrievalRows.slice(0, 3).map((row, idx) => {
          const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
          const pairs: string[] = [];
          for (const key of Object.keys(data)) {
            const lower = key.toLowerCase();
            if (priorityKeys.some((p) => lower.includes(p))) {
              pairs.push(`${key}: ${String(data[key] ?? "")}`);
            }
            if (pairs.length >= 8) break;
          }
          if (pairs.length === 0) {
            const fallbackPairs = Object.entries(data).slice(0, 6).map(([k, v]) => `${k}: ${String(v ?? "")}`);
            pairs.push(...fallbackPairs);
          }
          const source = row.importFilename || row.importName || "Unknown";
          return `Rekod ${idx + 1} (Source: ${source})\n${pairs.join("\n")}`;
        });
        return `Rekod dijumpai:\n${summaries.join("\n\n")}`;
      };

      const contextBlock =
        contextRows.length > 0
          ? `DATA SISTEM (HASIL CARIAN KATA KUNCI: ${searchTerms.join(", ")}):\n${contextRows.join("\n\n")}`
          : "DATA SISTEM: TIADA REKOD DIJUMPAI UNTUK KATA KUNCI INI.";

      const chatMessages = [
        {
          role: "system",
          content:
            "Anda ialah pembantu AI offline untuk sistem SQR. Jawab dalam Bahasa Melayu. " +
            "Jawapan mestilah berdasarkan DATA SISTEM di bawah. Jika tiada data yang sepadan, katakan dengan jelas bahawa tiada data dijumpai. " +
            "Jangan membuat andaian atau menambah fakta yang tiada dalam data.",
        },
        { role: "system", content: contextBlock },
        ...history.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
        { role: "user", content: message },
      ];

      let reply = "";
      try {
        reply = await ollamaChat(chatMessages, { num_predict: 96, temperature: 0.2, top_p: 0.9 });
      } catch (err: any) {
        if (err?.name === "AbortError") {
          reply = buildQuickReply();
        } else {
          throw err;
        }
      }

      await storage.saveConversationMessage(conversationId, "user", message);
      await storage.saveConversationMessage(conversationId, "assistant", reply);

      await storage.createAuditLog({
        action: "AI_CHAT",
        performedBy: req.user!.username,
        details: `Conversation=${conversationId}`,
      });

      res.json({ conversationId, reply });
    } catch (error: any) {
      console.error("AI chat error:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

app.get("/api/columns", authenticateToken, async (req, res) => {
  try {
    const columns = await storage.getAllColumnNames();
        res.json(columns);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get("/api/activities", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
      try {
        const activities = await storage.getAllActivities();
        res.json(activities);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });
    
    app.get("/api/activities/active", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
      try {
        const activities = await storage.getActiveActivities();
        res.json(activities);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.post("/api/activities/filter", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
      try {
        const filters = req.body;
        const activities = await storage.getFilteredActivities(filters);
        res.json(activities);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });
    
    app.post(
      "/api/admin/ban",
      authenticateToken,
      requireRole("superuser"),
      async (req: AuthenticatedRequest, res) => {
        try {
          const { username } = req.body;
          if (!username) {
            return res.status(400).json({ message: "Username required" });
          }

          // ❌ Tak boleh ban superuser
          const targetUser = await storage.getUserByUsername(username);
          if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
          }

          if (targetUser.role === "superuser") {
            return res.status(403).json({ message: "Cannot ban a superuser" });
          }

          // 1️⃣ BAN ACCOUNT
          await storage.updateUserBan(username, true);

          // 2️⃣ TUTUP SEMUA SESSION DB
          await storage.deactivateUserActivities(username, "BANNED");

          const activities = await storage.getAllActivities();

          for (const activity of activities) {
            if (activity.username !== username) continue;

            const ws = connectedClients.get(activity.id);
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "banned",
                reason: "Your account has been banned.",
              }));
              ws.close();
            }

            connectedClients.delete(activity.id);
          }

          // 4️⃣ AUDIT LOG
          await storage.createAuditLog({
            action: "BAN_USER",
            performedBy: req.user!.username,
            targetUser: username,
            details: "Admin ban (account-level)",
          });

          res.json({ success: true });
        } catch (error: any) {
          console.error("Admin ban error:", error);
          res.status(500).json({ message: error.message });
        }
      }
    );

    app.post(
      "/api/admin/unban",
      authenticateToken,
      requireRole("superuser"),
      async (req: AuthenticatedRequest, res) => {
        try {
          const { banId } = req.body;
          if (!banId) {
            return res.status(400).json({ message: "banId required" });
          }

          await storage.unbanVisitor(banId);

          await storage.createAuditLog({
            action: "UNBAN_USER",
            performedBy: req.user!.username,
            details: `Unbanned banId=${banId}`,
          });

          res.json({ success: true });
        } catch (error: any) {
          console.error("Admin unban error:", error);
          res.status(500).json({ message: error.message });
        }
      }
    );

    app.get("/api/accounts", authenticateToken, requireRole("superuser"), async (req, res) => {
      try {
        const allUsers: any[] = [];
        const usernames = ["superuser", "admin1", "user1"];
        for (const username of usernames) {
          const user = await storage.getUserByUsername(username);
          if (user) {
            allUsers.push({ id: user.id, username: user.username, role: user.role, isBanned: user.isBanned });
          }
        }
        res.json(allUsers);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.post("/api/users", authenticateToken, requireRole("superuser"), async (req: AuthenticatedRequest, res) => {
      try {
        const { username, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await storage.createUser({ username, password: hashedPassword, role });
        await storage.createAuditLog({
          action: "CREATE_USER",
          performedBy: req.user!.username,
          targetUser: username,
          details: `Created user with role: ${role}`,
        });
        res.json({ id: user.id, username: user.username, role: user.role, isBanned: user.isBanned });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get("/api/audit-logs", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
      try {
        const logs = await storage.getAuditLogs();
        res.json({ logs: logs });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get("/api/audit-logs/stats", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
      try {
        const logs = await storage.getAuditLogs();
        const stats = {
          totalLogs: logs.length,
          todayLogs: logs.filter((l: any) => {
            const logDate = new Date(l.timestamp || l.createdAt);
            const today = new Date();
            return logDate.toDateString() === today.toDateString();
          }).length,
          actionBreakdown: {} as Record<string, number>,
        };
        logs.forEach((log: any) => {
          const action = log.action || 'UNKNOWN';
          stats.actionBreakdown[action] = (stats.actionBreakdown[action] || 0) + 1;
        });
        res.json(stats);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get("/api/analyze/all", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
      try {
        const imports = await storage.getImports();
        if (imports.length === 0) {
          return res.json({
            totalImports: 0,
            totalRows: 0,
            imports: [],
            analysis: {
              icLelaki: { count: 0, samples: [] },
              icPerempuan: { count: 0, samples: [] },
              noPolis: { count: 0, samples: [] },
              noTentera: { count: 0, samples: [] },
              passportMY: { count: 0, samples: [] },
              passportLuarNegara: { count: 0, samples: [] },
              duplicates: { count: 0, items: [] },
            },
          });
        }

        let allRows: any[] = [];
        const importsWithCounts = await Promise.all(
          imports.map(async (imp: any) => {
            const rows = await storage.getDataRowsByImport(imp.id);
            allRows = allRows.concat(rows);
            return { id: imp.id, name: imp.name, filename: imp.filename, rowCount: rows.length };
          })
        );

        const analysis = analyzeDataRows(allRows);

        return res.json({
          totalImports: imports.length,
          totalRows: allRows.length,
          imports: importsWithCounts,
          analysis,
        });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    });

    app.get("/api/debug/websocket-clients", authenticateToken, requireRole("superuser"), async (req, res) => {
      try {
        const clients = Array.from(connectedClients.keys());
        res.json({ count: clients.length, clients });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.delete("/api/audit-logs/cleanup", authenticateToken, requireRole("superuser"), async (req: AuthenticatedRequest, res) => {
      try {
        const { olderThanDays } = req.body;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - (olderThanDays || 30));

        const logs = await storage.getAuditLogs();
        let deletedCount = 0;

        for (const log of logs) {
          if (log.timestamp) {
            const logDate = new Date(log.timestamp);
            if (logDate < cutoffDate) {
              deletedCount++;
            }
          }
        }

        await storage.createAuditLog({
          action: "CLEANUP_AUDIT_LOGS",
          performedBy: req.user!.username,
          details: `Cleanup requested for logs older than ${olderThanDays} days`,
        });

        res.json({ success: true, deletedCount, message: `Cleanup completed` });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get("/api/analytics/summary", authenticateToken, requireRole("superuser"), async (req, res) => {
      try {
        const summary = await storage.getDashboardSummary();
        res.json(summary);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get("/api/analytics/login-trends", authenticateToken, requireRole("superuser"), async (req, res) => {
      try {
        const days = parseInt(req.query.days as string) || 7;
        const trends = await storage.getLoginTrends(days);
        res.json(trends);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get("/api/analytics/top-users", authenticateToken, requireRole("superuser"), async (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 10;
        const topUsers = await storage.getTopActiveUsers(limit);
        res.json(topUsers);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get("/api/analytics/peak-hours", authenticateToken, requireRole("superuser"), async (req, res) => {
      try {
        const peakHours = await storage.getPeakHours();
        res.json(peakHours);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get("/api/analytics/role-distribution", authenticateToken, requireRole("superuser"), async (req, res) => {
      try {
        const distribution = await storage.getRoleDistribution();
        res.json(distribution);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get("/api/backups", authenticateToken, requireRole("superuser"), async (req, res) => {
      try {
        const backups = await storage.getBackups();
        res.json({ backups: backups });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.post("/api/backups", authenticateToken, requireRole("superuser"), async (req: AuthenticatedRequest, res) => {
      try {
        const { name } = req.body;
        const startTime = Date.now();
        const backupData = await storage.getBackupDataForExport();
        const metadata = {
          timestamp: new Date().toISOString(),
          importsCount: backupData.imports.length,
          dataRowsCount: backupData.dataRows.length,
          usersCount: backupData.users.length,
          auditLogsCount: backupData.auditLogs.length,
        };
        const backup = await storage.createBackup({
          name,
          createdBy: req.user!.username,
          backupData: JSON.stringify(backupData),
          metadata: JSON.stringify(metadata),
        });
        await storage.createAuditLog({
          action: "CREATE_BACKUP",
          performedBy: req.user!.username,
          targetResource: name,
          details: JSON.stringify({
            ...metadata,
            durationMs: Date.now() - startTime,
          }),
        });
        res.json(backup);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get("/api/backups/:id", authenticateToken, requireRole("superuser"), async (req, res) => {
      try {
        const backup = await storage.getBackupById(req.params.id);
        if (!backup) {
          return res.status(404).json({ message: "Backup not found" });
        }
        res.json(backup);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.post("/api/backups/:id/restore", authenticateToken, requireRole("superuser"), async (req: AuthenticatedRequest, res) => {
      try {
        const backup = await storage.getBackupById(req.params.id);
        if (!backup) {
          return res.status(404).json({ message: "Backup not found" });
        }
        const startTime = Date.now();
        const backupData = JSON.parse(backup.backupData);
        const result = await storage.restoreFromBackup(backupData);
        await storage.createAuditLog({
          action: "RESTORE_BACKUP",
          performedBy: req.user!.username,
          targetResource: backup.name,
          details: JSON.stringify({
            ...result.stats,
            durationMs: Date.now() - startTime,
          }),
        });
        res.json({
          ...result,
          message: `Restore completed in ${Math.round((Date.now() - startTime) / 1000)}s`,
        });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.delete("/api/backups/:id", authenticateToken, requireRole("superuser"), async (req: AuthenticatedRequest, res) => {
      try {
        const backup = await storage.getBackupById(req.params.id);
        const deleted = await storage.deleteBackup(req.params.id);
        if (!deleted) {
          return res.status(404).json({ message: "Backup not found" });
        }
        await storage.createAuditLog({
          action: "DELETE_BACKUP",
          performedBy: req.user!.username,
          targetResource: backup?.name || req.params.id,
        });
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    wss.on("connection", async (ws, req) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const token = url.searchParams.get("token");

      if (!token) {
        ws.close();
        return;
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        const activityId = decoded.activityId;

        // 🔐 STEP WAJIB — VALIDATE SESSION DARI DB
        const activity = await storage.getActivityById(activityId);

        if (
          !activity ||
          activity.isActive === false ||
          activity.logoutTime !== null
        ) {
          console.log("❌ WS rejected: invalid / expired session");
          ws.close();
          return;
        }

        // 🔐 FIX #3 — elak overwrite socket lama
        const existingWs = connectedClients.get(activityId);
        if (existingWs && existingWs.readyState === WebSocket.OPEN) {
          existingWs.close();
        }

        connectedClients.set(activityId, ws);
        console.log(`✅ WebSocket connected for activityId=${activityId}`);

        ws.on("close", () => {
          if (connectedClients.get(activityId) === ws) {
            connectedClients.delete(activityId);
          }
          console.log(`WebSocket closed for activityId=${activityId}`);
        });
      } catch (err) {
        console.log("❌ WS handshake failed");
        ws.close();
      }
    });

    function serveStatic() {
      const cwd = process.cwd();

      const possiblePaths = [
        "dist-local/public",
        "dist-local\\public",
        "dist/public",
        "dist\\public",
      ];

      console.log(`  Working directory: ${cwd}`);

      let foundPath: string | null = null;
      let foundIndex: string | null = null;

      for (const relPath of possiblePaths) {
        const fullPath = path.resolve(cwd, relPath);
        const indexFile = path.join(fullPath, "index.html");

        console.log(`  Checking: ${fullPath}`);

        try {
          if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
            const files = fs.readdirSync(fullPath);
            console.log(`    Found ${files.length} files: ${files.slice(0, 5).join(", ")}${files.length > 5 ? "..." : ""}`);

            if (fs.existsSync(indexFile)) {
              foundPath = fullPath;
              foundIndex = indexFile;
              break;
            }
          }
        } catch (err: any) {
          console.log(`    Error: ${err.message}`);
        }
      }

      if (foundPath && foundIndex) {
        console.log(`  Frontend: Serving from ${foundPath}`);
        app.use(express.static(foundPath));

        app.use((req, res, next) => {
          if (req.path.startsWith("/api") || req.path.startsWith("/ws")) {
            return next();
          }
          res.sendFile(foundIndex!);
        });

        console.log(`  Frontend: OK`);
      } else {
        console.log("");
        console.log("  ERROR: Frontend files not found!");
        console.log("  Please run: npm run build:local");
        console.log(`  Expected location: ${path.resolve(cwd, "dist-local/public")}`);

        app.use((req, res) => {
          if (!req.path.startsWith("/api")) {
            res.status(404).send(`
          <html>
            <body style="font-family: sans-serif; padding: 40px;">
              <h1>Frontend Not Built</h1>
              <p>Please run: <code>npm run build:local</code></p>
              <p>Then restart the server.</p>
            </body>
          </html>
        `);
          }
        });
      }
    }

    setInterval(async () => {
      if (idleSweepRunning) return;
      idleSweepRunning = true;
      try {
        const now = Date.now();
        const activities = await storage.getActiveActivities();

        for (const activity of activities) {
          if (!activity.lastActivityTime) continue;

          const last = new Date(activity.lastActivityTime).getTime();
          const diff = now - last;

          if (diff > WS_IDLE_MS) {

            // 🔐 FIX #2B — PROTECT RACE CONDITION
            const freshActivity = await storage.getActivityById(activity.id);
            if (!freshActivity || freshActivity.isActive === false) {
              continue;
            }
            const freshLast = freshActivity.lastActivityTime
              ? new Date(freshActivity.lastActivityTime).getTime()
              : 0;
            const freshDiff = now - freshLast;
            if (!freshLast || freshDiff <= WS_IDLE_MS) {
              continue;
            }

            console.log(
              `⏱️ IDLE TIMEOUT: ${activity.username} (${activity.id})`
            );

            // 1️⃣ TUTUP SESSION DB
            await storage.updateActivity(activity.id, {
              isActive: false,
              logoutTime: new Date(),
              logoutReason: "IDLE_TIMEOUT",
            });

            // 2️⃣ TUTUP WEBSOCKET
            const ws = connectedClients.get(activity.id);
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "idle_timeout",
                reason: "Session expired due to inactivity",
              }));
              ws.close();
            }

            connectedClients.delete(activity.id);

            // 3️⃣ AUDIT LOG
            await storage.createAuditLog({
              action: "SESSION_IDLE_TIMEOUT",
              performedBy: activity.username,
              details: `Auto logout after ${WS_IDLE_MINUTES} minutes idle`,
            });
          }
        }
      } catch (err) {
        console.error("Idle session checker error:", err);
      } finally {
        idleSweepRunning = false;
      }
    }, 60 * 1000);

    async function startServer() {
      console.log("");
      console.log("=========================================");
      console.log("  SQR - SUMBANGAN QUERY RAHMAH");
      console.log("  Mode: Local (PostgreSQL Database)");
      console.log("=========================================");
      console.log("");

      console.log("  Database: PostgreSQL - OK");
      await storage.init();
      if (AI_PRECOMPUTE_ON_START) {
        // Precompute runs later (non-blocking) below.
      }

      serveStatic();

      const PORT = parseInt(process.env.PORT || "5000", 10);
      const HOST = "0.0.0.0";

      server.listen(PORT, HOST, () => {
        console.log("");
        console.log("=========================================");
        console.log(`  Server berjalan di port ${PORT}`);
        console.log("");
        console.log("  Buka browser:");
        console.log(`    http://localhost:${PORT}`);
        console.log("");
        console.log("  Untuk akses dari PC lain (LAN):");
        console.log(`    http://[IP-KOMPUTER]:${PORT}`);
        console.log("=========================================");
        console.log("");
      });

      if (AI_PRECOMPUTE_ON_START) {
        // Run precompute in background so startup is fast.
        setTimeout(async () => {
          try {
            const rules = await loadCategoryRules();
            const enabledRuleKeys = rules.filter((r) => r.enabled !== false).map((r) => r.key);
            const targetKeys = Array.from(new Set(["__all__", ...enabledRuleKeys]));
            const rulesUpdatedAt = await storage.getCategoryRulesMaxUpdatedAt();
            const existing = await storage.getCategoryStats(targetKeys);
            const byKey = new Map(existing.map((row) => [row.key, row]));
            const statsUpdatedAt = byKey.get("__all__")?.updatedAt ?? null;
            const hasAllKeys = targetKeys.every((k) => byKey.has(k));
            const isStale = Boolean(rulesUpdatedAt && statsUpdatedAt && rulesUpdatedAt > statsUpdatedAt);

            if (hasAllKeys && !isStale) {
              console.log("✅ Category stats already present. Skipping precompute.");
              return;
            }

            const missingKeys = targetKeys.filter((k) => !byKey.has(k));
            const computeKeys = isStale ? targetKeys : Array.from(new Set([...missingKeys, "__all__"]));
            console.log(`⏱️ Precomputing category stats (${computeKeys.length} key(s))...`);
            await storage.computeCategoryStatsForKeys(computeKeys, rules);
            console.log("✅ Precomputed category stats.");
          } catch (err: any) {
            console.error("❌ Precompute stats failed:", err?.message || err);
          }
        }, 0);
      }
    }

    startServer();
