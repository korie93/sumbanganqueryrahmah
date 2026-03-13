import type { RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";

type AiRole = "user" | "admin" | "superuser";
type AiRoute = "search" | "chat";

type AiGateLease = {
  role: AiRole;
  route: AiRoute;
  released: boolean;
};

type AiGateAcquireResult = {
  lease: AiGateLease;
  waitedMs: number;
};

type AiGateQueueItem = {
  id: number;
  role: AiRole;
  route: AiRoute;
  enqueuedAt: number;
  resolve: (result: AiGateAcquireResult) => void;
  reject: (error: Error & { code?: string; status?: number }) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type AiRoleLimits = Record<AiRole, number>;

type CreateAiConcurrencyGateOptions = {
  globalLimit: number;
  queueLimit: number;
  queueWaitMs: number;
  roleLimits: AiRoleLimits;
};

export function createAiConcurrencyGate(options: CreateAiConcurrencyGateOptions): {
  withAiConcurrencyGate: (
    route: AiRoute,
    handler: (req: AuthenticatedRequest, res: Response) => Promise<unknown>,
  ) => RequestHandler;
} {
  const { globalLimit, queueLimit, queueWaitMs, roleLimits } = options;

  let sequence = 0;
  let inflightGlobal = 0;
  const inflightByRole: AiRoleLimits = {
    user: 0,
    admin: 0,
    superuser: 0,
  };
  const queue: AiGateQueueItem[] = [];

  const normalizeAiRole = (role: string | undefined): AiRole => {
    if (role === "superuser") return "superuser";
    if (role === "admin") return "admin";
    return "user";
  };

  const getAiGateSnapshot = (role?: AiRole) => {
    const safeRole = role ? normalizeAiRole(role) : "user";
    return {
      globalInFlight: inflightGlobal,
      globalLimit,
      queueSize: queue.length,
      queueLimit,
      role: safeRole,
      roleInFlight: inflightByRole[safeRole],
      roleLimit: roleLimits[safeRole],
    };
  };

  const canAcquire = (role: AiRole) =>
    inflightGlobal < globalLimit && inflightByRole[role] < roleLimits[role];

  const acquire = (role: AiRole, route: AiRoute): AiGateLease => {
    inflightGlobal += 1;
    inflightByRole[role] += 1;
    return {
      role,
      route,
      released: false,
    };
  };

  const drainQueue = () => {
    if (queue.length === 0) return;

    let progressed = true;
    while (progressed && queue.length > 0) {
      progressed = false;

      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index];
        if (!canAcquire(item.role)) continue;

        queue.splice(index, 1);
        clearTimeout(item.timeout);
        progressed = true;

        item.resolve({
          lease: acquire(item.role, item.route),
          waitedMs: Math.max(0, Date.now() - item.enqueuedAt),
        });
        break;
      }
    }
  };

  const release = (lease: AiGateLease) => {
    if (lease.released) return;
    lease.released = true;

    inflightGlobal = Math.max(0, inflightGlobal - 1);
    inflightByRole[lease.role] = Math.max(0, inflightByRole[lease.role] - 1);

    queueMicrotask(() => {
      drainQueue();
    });
  };

  const createGateError = (
    message: string,
    code: string,
    status = 429,
  ): Error & { code?: string; status?: number } => {
    const error = new Error(message) as Error & { code?: string; status?: number };
    error.code = code;
    error.status = status;
    return error;
  };

  const waitForSlot = (role: AiRole, route: AiRoute): Promise<AiGateAcquireResult> => {
    if (canAcquire(role)) {
      return Promise.resolve({
        lease: acquire(role, route),
        waitedMs: 0,
      });
    }

    if (queue.length >= queueLimit) {
      return Promise.reject(
        createGateError(
          "AI queue is full. Please retry in a few seconds.",
          "AI_GATE_QUEUE_FULL",
          429,
        ),
      );
    }

    return new Promise<AiGateAcquireResult>((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => {
        const index = queue.findIndex((item) => item.id === id);
        if (index >= 0) {
          queue.splice(index, 1);
        }

        reject(
          createGateError(
            "AI queue wait timed out. Please retry.",
            "AI_GATE_WAIT_TIMEOUT",
            429,
          ),
        );
      }, queueWaitMs).unref();

      queue.push({
        id,
        role,
        route,
        enqueuedAt: Date.now(),
        resolve,
        reject,
        timeout,
      });

      drainQueue();
    });
  };

  const withAiConcurrencyGate = (
    route: AiRoute,
    handler: (req: AuthenticatedRequest, res: Response) => Promise<unknown>,
  ): RequestHandler => {
    return async (req: AuthenticatedRequest, res: Response) => {
      const role = normalizeAiRole(req.user?.role);
      let acquired: AiGateAcquireResult | null = null;

      try {
        acquired = await waitForSlot(role, route);
      } catch (error: any) {
        const status = Number.isFinite(error?.status) ? Number(error.status) : 429;
        const snapshot = getAiGateSnapshot(role);
        return res.status(status).json({
          message: error?.message || "AI queue is currently busy. Please retry shortly.",
          gate: {
            ...snapshot,
            queueWaitMs,
            code: error?.code || "AI_GATE_BUSY",
          },
        });
      }

      const releaseOnce = () => {
        if (!acquired) return;
        release(acquired.lease);
        acquired = null;
      };

      res.once("finish", releaseOnce);
      res.once("close", releaseOnce);
      res.setHeader("x-ai-gate-global-limit", String(globalLimit));
      res.setHeader("x-ai-gate-inflight", String(inflightGlobal));
      res.setHeader("x-ai-gate-queue-size", String(queue.length));
      if (acquired.waitedMs > 0) {
        res.setHeader("x-ai-gate-wait-ms", String(Math.round(acquired.waitedMs)));
      }

      try {
        await handler(req, res);
      } finally {
        releaseOnce();
      }
    };
  };

  return { withAiConcurrencyGate };
}
