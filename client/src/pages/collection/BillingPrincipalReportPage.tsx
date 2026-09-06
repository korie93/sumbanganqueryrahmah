import { getStoredAuthenticatedUser } from "@/lib/auth-session";
import { BillingPrincipalSavedTargetShell } from "./BillingPrincipalSavedTargetShell";

export default function BillingPrincipalReportPage({ role }: { role: string }) {
  const user = getStoredAuthenticatedUser();
  if (!["superuser", "manager", "admin"].includes(role) || !user?.id) {
    return <p role="alert" className="rounded-xl border bg-card p-5 text-sm">Billing OSP requires an authenticated staff account. Sign in again if your session has expired.</p>;
  }
  // Account identity, not nickname or role alone, owns the private client subtree.
  return <BillingPrincipalSavedTargetShell key={user.id + ":" + role} role={role} />;
}
