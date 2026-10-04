import { Mail, ShieldCheck } from "lucide-react";

type SecurityOverviewProps = {
  twoFactorEnabled: boolean;
  twoFactorPendingSetup: boolean;
  email?: string | null | undefined;
};

/** Reflect current-user facts only: an email address is not proof of verification. */
export function SecurityOverview({ twoFactorEnabled, twoFactorPendingSetup, email }: SecurityOverviewProps) {
  const hasEmail = Boolean(email?.trim());
  return <section className="security-overview" aria-labelledby="security-overview-heading" data-testid="security-overview">
    <h2 id="security-overview-heading">Your security settings</h2>
    <dl className="security-overview-items">
      <div>
        <dt><ShieldCheck aria-hidden="true" />Two-factor authentication</dt>
        <dd data-state={twoFactorEnabled ? "enabled" : "neutral"}>{twoFactorEnabled ? "Enabled" : twoFactorPendingSetup ? "Setup pending" : "Not enabled"}</dd>
      </div>
      <div>
        <dt><Mail aria-hidden="true" />Account email</dt>
        <dd>{hasEmail ? "Provided" : "Not provided"}</dd>
      </div>
    </dl>
    {!hasEmail ? <p>Contact your administrator to add an email address to your account.</p> : null}
  </section>;
}
