import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "../lib/logger";

const ROUTE_ERROR_LOGGED_SYMBOL = Symbol.for("sqr.routeErrorLogged");

type RouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown | Promise<unknown>;

type RouteErrorLike = Error & {
  [ROUTE_ERROR_LOGGED_SYMBOL]?: true;
};

type RouteLoggerOptions = {
  message?: string | undefined;
};

function readRoutePath(req: Request) {
  const routePath = req.route?.path;
  return typeof routePath === "string"
    ? routePath
    : Array.isArray(routePath)
      ? routePath.join(",")
      : undefined;
}

export function markRouteErrorLogged(error: unknown) {
  if (!error || typeof error !== "object") {
    return;
  }

  Object.defineProperty(error, ROUTE_ERROR_LOGGED_SYMBOL, {
    configurable: true,
    enumerable: false,
    value: true,
    writable: true,
  });
}

export function wasRouteErrorLogged(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as RouteErrorLike)[ROUTE_ERROR_LOGGED_SYMBOL] === true,
  );
}

export function logRouteHandlerError(
  error: unknown,
  req: Request,
  options?: RouteLoggerOptions,
) {
  if (wasRouteErrorLogged(error)) {
    return;
  }

  logger.error(options?.message || "Unhandled route handler error", {
    error,
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl || undefined,
    routePath: readRoutePath(req),
    username: (req as { user?: { username?: string | undefined } }).user?.username || undefined,
  });

  markRouteErrorLogged(error);
}

export function routeHandler(
  handler: RouteHandler,
  options?: RouteLoggerOptions,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch((error) => {
      logRouteHandlerError(error, req, options);
      next(error);
    });
  };
}
