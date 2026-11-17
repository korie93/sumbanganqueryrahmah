import { once } from "node:events";
import type { Server } from "node:http";
import { AddressInfo } from "node:net";
import express, { type Express, type RequestHandler } from "express";
import type { AuthenticatedRequest, AuthenticatedUser } from "../../auth/guards";
import { createPreAuthRateLimiter, handlePreAuthRateLimitError } from "../../middleware/pre-auth-rate-limit";
import { BoundedMemoryRateLimitStore } from "../../middleware/redis-rate-limit-store";

export function createRateLimitedTestApp(requestsPerMinute?: number): Express {
  const app = express();
  // Real bounded admission control for synthetic HTTP servers, including
  // /fixture paths. Never connect a fixture to a configured shared Redis store.
  app.use(createPreAuthRateLimiter({
    allPaths: true,
    store: new BoundedMemoryRateLimitStore(Date.now),
    ...(requestsPerMinute === undefined ? {} : { requestsPerMinute }),
  }), handlePreAuthRateLimitError);
  return app;
}

export function createJsonTestApp(): Express {
  const app = createRateLimitedTestApp();
  app.use(express.json());
  return app;
}

export async function startTestServer(app: Express) {
  // Synthetic auth headers must never be reachable on the developer's LAN.
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error("Test server failed to start.");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

export async function stopTestServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function createTestAuthenticateToken(
  defaults?: Partial<AuthenticatedUser>,
): RequestHandler {
  return (req: AuthenticatedRequest, res, next) => {
    const username = String(req.headers["x-test-username"] || defaults?.username || "").trim();
    const role = String(req.headers["x-test-role"] || defaults?.role || "").trim();

    if (!username || !role) {
      res.status(401).json({ message: "Token required" });
      return;
    }

    req.user = {
      userId: String(req.headers["x-test-userid"] || defaults?.userId || "").trim() || undefined,
      username,
      role,
      activityId: String(req.headers["x-test-activityid"] || defaults?.activityId || "test-activity"),
      status: defaults?.status,
      mustChangePassword: defaults?.mustChangePassword,
      passwordResetBySuperuser: defaults?.passwordResetBySuperuser,
      isBanned: defaults?.isBanned ?? null,
    };
    next();
  };
}

export function createTestRequireRole(): (...roles: string[]) => RequestHandler {
  return (...roles: string[]) => (req: AuthenticatedRequest, res, next) => {
    if (!req.user) {
      res.status(401).json({ message: "Authentication required." });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    next();
  };
}

export function createTestRequireTabAccess(): (tabId: string) => RequestHandler {
  return (tabId: string) => (req: AuthenticatedRequest, res, next) => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthenticated" });
      return;
    }

    if (req.user.role === "superuser") {
      next();
      return;
    }

    const deniedTabs = String(req.headers["x-test-deny-tabs"] || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (deniedTabs.includes(tabId)) {
      res.status(403).json({ message: `Tab '${tabId}' is disabled for role '${req.user.role}'` });
      return;
    }

    next();
  };
}

export function allowAllTabs(): RequestHandler {
  return (_req, _res, next) => next();
}
