import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  requestId: string;
  httpMethod?: string | undefined;
  httpPath?: string | undefined;
  clientIp?: string | undefined;
  userAgent?: string | undefined;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn);
}

export function getRequestIdFromContext(): string | null {
  return requestContextStorage.getStore()?.requestId || null;
}

export function getRequestContext(): RequestContext | null {
  return requestContextStorage.getStore() || null;
}
