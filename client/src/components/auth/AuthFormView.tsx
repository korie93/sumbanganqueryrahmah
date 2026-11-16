import { useState, type ReactNode } from "react";
import { getActiveViewTransitionKind } from "@/lib/view-transition";
import { getPublicAuthArrivalKind } from "@/lib/public-auth-arrival";

/** A route/status key starts one entry; preference updates never replay it. */
export function AuthFormView({ children, statusEntry = false }: { children: ReactNode; statusEntry?: boolean }) {
  const [animateArrival] = useState(() => statusEntry || (getActiveViewTransitionKind() === null
    && getPublicAuthArrivalKind() !== "page"));
  return <div className={`auth-v17-view${animateArrival ? " auth-form-enter" : ""}`}>{children}</div>;
}
