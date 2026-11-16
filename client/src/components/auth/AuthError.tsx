import type { ReactNode } from "react";
import "./AuthError.css";

/** Mount only for an existing error; one alert retains the flow's original copy. */
export function AuthError({ children }: { children: ReactNode }) {
  return <div className="auth-error" data-open="true" role="alert" aria-atomic="true">
    <div className="auth-error__clip">
      <div className="public-auth-status-card public-auth-status-card--error">{children}</div>
    </div>
  </div>;
}
