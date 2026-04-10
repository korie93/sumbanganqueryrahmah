import type { NextFunction, Request, RequestHandler, Response } from "express";
import { routeHandler } from "./route-observability";

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return routeHandler(fn);
}

export { routeHandler } from "./route-observability";
