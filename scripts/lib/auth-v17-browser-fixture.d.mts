import type { Route } from "@playwright/test";

export const authV17Viewports: ReadonlyArray<{ width: number; height: number }>;
export const authV17FixtureIdentity: Readonly<{ username: string; password: string; token: string }>;

export function assertAuthV17StartupScriptBudget(entryScripts: string[], loginScripts: string[]): Set<string>;

export type AuthV17FixtureState = {
  login: string;
  verify: string;
  resetToken: string;
  forgot: string;
  loginGate: Promise<void> | null;
  forgotGate: Promise<void> | null;
  resetGate: Promise<void> | null;
  counts: { login: number; verify: number; forgot: number; reset: number; validate: number };
  unexpected: string[];
};

/** Fictional HTTP boundary for the actual compiled public auth pages. */
export function createAuthV17Fixture(origin: string): {
  state: AuthV17FixtureState;
  route: (route: Route) => Promise<void>;
};
