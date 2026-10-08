type RedisErrorEmitter = {
  on(event: "error", listener: () => void): unknown;
  off(event: "error", listener: () => void): unknown;
};

/** Attach after the store's error listener so transient degradation is observed synchronously. */
export function observeRedisDegradation(client: RedisErrorEmitter, isDegraded: () => boolean) {
  let observedDegradation = false;
  const onError = () => {
    if (isDegraded()) observedDegradation = true;
  };
  client.on("error", onError);
  return {
    hasObservedDegradation: () => observedDegradation,
    stop: () => { client.off("error", onError); },
  };
}
