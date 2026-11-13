import { useState, type ReactNode } from "react";
import { getActiveViewTransitionKind } from "@/lib/view-transition";

/** A route/status key starts one entry; preference updates never replay it. */
export function AuthFormView({ children, statusEntry = false }: { children: ReactNode; statusEntry?: boolean }) {
  const [animateArrival] = useState(() => statusEntry || getActiveViewTransitionKind() === null);
  return <div className={`auth-v17-view${animateArrival ? " auth-form-enter" : ""}`}>{children}</div>;
}
