import {
  logClientError,
  type ClientLoggerEnvironment,
} from "../lib/client-logger";

export type AutoLogoutCallback = (() => void | Promise<void>) | null | undefined;

export type AutoLogoutCallbackResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: unknown };

export type InvokeAutoLogoutCallbackOptions = {
  readonly env?: ClientLoggerEnvironment | undefined;
  readonly label: "client_logout" | "idle_logout";
  readonly loginPath?: string | undefined;
  readonly redirectToLogin?: ((path: string) => void) | undefined;
};

const DEFAULT_AUTO_LOGOUT_LOGIN_PATH = "/login";

export function redirectBrowserToLogin(path = DEFAULT_AUTO_LOGOUT_LOGIN_PATH): void {
  window.location.href = path;
}

export async function invokeAutoLogoutCallback(
  callback: AutoLogoutCallback,
  options: InvokeAutoLogoutCallbackOptions,
): Promise<AutoLogoutCallbackResult> {
  try {
    await callback?.();
    return { ok: true };
  } catch (error) {
    logClientError(`[AutoLogout] ${options.label} callback failed`, error, undefined, options.env);
    const loginPath = options.loginPath ?? DEFAULT_AUTO_LOGOUT_LOGIN_PATH;
    const redirect = options.redirectToLogin ?? redirectBrowserToLogin;
    redirect(loginPath);
    return { ok: false, error };
  }
}
