type AsyncMethod = (...args: unknown[]) => Promise<unknown>;

type WrapOptions = {
  exclude?: ReadonlySet<string>;
  wrap: <T>(fn: () => Promise<T>) => Promise<T>;
};

export function wrapAsyncPrototypeMethods<T extends object>(
  target: T,
  options: WrapOptions,
): void {
  const prototype = Object.getPrototypeOf(target);
  if (!prototype || typeof prototype !== "object") {
    return;
  }

  const host = target as Record<string, unknown>;
  for (const methodName of Object.getOwnPropertyNames(prototype)) {
    if (options.exclude?.has(methodName)) {
      continue;
    }

    const candidate = Reflect.get(target, methodName);
    if (typeof candidate !== "function") {
      continue;
    }

    const method = candidate as AsyncMethod;
    if (method.constructor?.name !== "AsyncFunction") {
      continue;
    }

    const original = method.bind(target);
    host[methodName] = async (...args: unknown[]) => options.wrap(() => original(...args));
  }
}
