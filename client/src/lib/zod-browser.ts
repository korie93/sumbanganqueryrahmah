import { config } from "zod/v4";

// Configure Zod before browser consumers construct their schemas. Its default
// object JIT probes Function even when CSP blocks it and parsing falls back.
// The browser-only alias keeps strict CSP/Trusted Types and server JIT intact.
config({ jitless: true });

export * from "zod/v4";
export { default } from "zod/v4";
