import { evaluatePasswordStrength } from "@/lib/password-strength";
import { getCredentialPasswordValidationIssues } from "@shared/password-policy";
import { PasswordRequirementsChecklist } from "./PasswordRequirementsChecklist";

type PasswordStrengthMeterProps = {
  className?: string;
  id?: string;
  password: string;
  variant?: "default" | "checklist";
  interacted?: boolean;
};

const SEGMENT_ACTIVE_CLASSES = [
  "bg-red-700 dark:bg-red-400",
  "bg-orange-700 dark:bg-orange-400",
  "bg-yellow-700 dark:bg-yellow-400",
  "bg-lime-700 dark:bg-lime-400",
  "bg-green-700 dark:bg-green-400",
] as const;

const LABEL_CLASSES = [
  "text-red-700 dark:text-red-200",
  "text-orange-700 dark:text-orange-200",
  "text-yellow-700 dark:text-yellow-200",
  "text-lime-700 dark:text-lime-200",
  "text-green-700 dark:text-green-200",
] as const;

/**
 * Renders the shared password strength meter component used across SQR screens.
 */
export function PasswordStrengthMeter({
  className = "",
  id = "password-strength",
  password,
  variant = "default",
  interacted = false,
}: PasswordStrengthMeterProps) {
  if (variant === "checklist") {
    return <PasswordRequirementsChecklist id={id} password={password} className={className} interacted={interacted} />;
  }
  const evaluation = evaluatePasswordStrength(password);
  const issues = getCredentialPasswordValidationIssues(password, "ms");
  const policyValid = issues.length === 0;
  const filledSegments = password.length > 0 ? evaluation.level + 1 : 0;
  const activeSegmentClass = SEGMENT_ACTIVE_CLASSES[evaluation.level];
  const labelClass = LABEL_CLASSES[evaluation.level];

  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      aria-label={`${evaluation.ariaLabel}. ${policyValid ? "Kata laluan sah." : "Syarat kata laluan belum dipenuhi."}`}
      className={`rounded-lg border border-slate-200/80 bg-white/70 p-3 text-xs text-slate-600 shadow-sm dark:border-border/70 dark:bg-card dark:text-muted-foreground ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-slate-700 dark:text-card-foreground">
          Kekuatan kata laluan
        </span>
        <span className={`font-semibold ${labelClass}`}>
          {evaluation.malayLabel}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={`h-1.5 rounded-full transition-colors duration-200 motion-reduce:transition-none ${
              segment < filledSegments
                ? activeSegmentClass
                : "bg-slate-200/80 dark:bg-muted"
            }`}
          />
        ))}
      </div>
      {issues.length > 0 ? (
        <ul className="mt-2 space-y-1 text-slate-600 dark:text-muted-foreground">
          {issues.map((issue) => (
            <li key={issue.code}>{issue.message}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-green-700 dark:text-green-200">
          Kata laluan sah. Semua syarat kata laluan dipenuhi.
        </p>
      )}
    </div>
  );
}
