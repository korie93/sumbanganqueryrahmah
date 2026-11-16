import { AuthEntryPage, ForgotPasswordPage, LandingPage, LoginPage } from "@/app/lazy-pages";

export type AuthFormPage = "login" | "forgot-password";
type AuthEntryComponent = Awaited<ReturnType<typeof AuthEntryPage.preload>>["default"];
type LoginComponent = Awaited<ReturnType<typeof LoginPage.preload>>["default"];
type ForgotComponent = Awaited<ReturnType<typeof ForgotPasswordPage.preload>>["default"];
type LandingComponent = Awaited<ReturnType<typeof LandingPage.preload>>["default"];

let entry: AuthEntryComponent | null = null;
let login: LoginComponent | null = null;
let forgot: ForgotComponent | null = null;
let landing: LandingComponent | null = null;
let latestIntent = 0;
export { hasPublicAuthArrival, markPublicAuthArrival } from "./public-auth-arrival";

/** Only an ordinary user activation calls this; no idle or mount preloading. */
export async function preloadAuthNavigation(to: string): Promise<void> {
  const pathname = to.split(/[?#]/, 1)[0];
  if (pathname === "/login" || pathname === "/forgot-password") {
    const entryReady = AuthEntryPage.preload().then(module => { entry = module.default; });
    const formReady = pathname === "/login"
      ? LoginPage.preload().then(module => { login = module.default; })
      : ForgotPasswordPage.preload().then(module => { forgot = module.default; });
    await Promise.all([entryReady, formReady]);
  } else if (pathname === "/") {
    landing = (await LandingPage.preload()).default;
  }
}

/** Memoize the selected entry component for the whole auth-family mount. */
export function getPreloadedAuthEntry() {
  return entry;
}

export function getPreloadedAuthForm(page: "login"): LoginComponent | null;
export function getPreloadedAuthForm(page: "forgot-password"): ForgotComponent | null;
export function getPreloadedAuthForm(page: AuthFormPage): LoginComponent | ForgotComponent | null;
/** Memoize by page so unrelated renders never replace a mounted lazy form. */
export function getPreloadedAuthForm(page: AuthFormPage) {
  return page === "login" ? login : forgot;
}

/** Memoize the chosen landing component for each landing-family mount. */
export function getPreloadedLanding() {
  return landing;
}

export type AuthNavigationIntent = {
  isCurrent: () => boolean;
  cancel: () => void;
};

/** A stale link's cleanup cannot cancel a newer link's pending navigation. */
export function beginAuthNavigationIntent(): AuthNavigationIntent {
  const intent = ++latestIntent;
  return {
    isCurrent: () => intent === latestIntent,
    cancel: () => { if (intent === latestIntent) latestIntent++; },
  };
}

/** Popstate or another external navigation may supersede an awaited preload. */
export function invalidateAuthNavigationIntents() {
  latestIntent++;
}

