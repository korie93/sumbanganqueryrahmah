import { CheckCircle2, Circle, CircleX } from "lucide-react";
import { evaluatePasswordStrength } from "@/lib/password-strength";
import { getPasswordRequirements } from "@/lib/password-requirements";

type PasswordRequirementsChecklistProps = {
  id: string;
  password: string;
  className?: string;
  interacted?: boolean;
};

const STRENGTH_SEGMENT_CLASSES = [
  "bg-red-700 dark:bg-red-400",
  "bg-red-700 dark:bg-red-400",
  "bg-amber-700 dark:bg-amber-400",
  "bg-green-600 dark:bg-green-400",
  "bg-green-800 dark:bg-green-300",
] as const;

const STRENGTH_LABEL_CLASSES = [
  "text-red-700 dark:text-red-200",
  "text-red-700 dark:text-red-200",
  "text-amber-700 dark:text-amber-200",
  "text-green-700 dark:text-green-200",
  "text-green-800 dark:text-green-200",
] as const;

/** Stable checklist from the shared password policy, with a separate strength estimate. */
export function PasswordRequirementsChecklist({ id, password, className = "", interacted = false }: PasswordRequirementsChecklistProps) {
  const { valid, requirements, satisfiedCount } = getPasswordRequirements(password);
  const evaluated = interacted || password.length > 0;
  const strength = evaluatePasswordStrength(password);
  const filledSegments = password ? strength.level + 1 : 0;
  const policyMessage = valid
    ? "Kata laluan sah. Semua syarat dipenuhi."
    : "Lengkapkan semua syarat sebelum meneruskan.";

  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={`rounded-xl border border-border bg-background p-3 text-sm text-foreground ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`${id}-heading`} className="text-sm font-semibold">Keperluan kata laluan</h2>
        <span data-password-requirement-count className={`text-xs ${valid ? "text-green-700 dark:text-green-200" : "text-muted-foreground"}`}>{satisfiedCount}/{requirements.length} dipenuhi</span>
      </div>
      <ul className="mt-3 space-y-2" aria-label="Syarat kata laluan">
        {requirements.map(({ id: requirementId, label, satisfied }) => {
          const state = satisfied ? "success" : evaluated ? "error" : "neutral";
          const Icon = satisfied ? CheckCircle2 : evaluated ? CircleX : Circle;
          return (
            <li
              key={requirementId}
              data-password-requirement={requirementId}
              data-satisfied={satisfied ? "true" : "false"}
              data-state={state}
              className={`flex items-start gap-2 leading-5 ${satisfied ? "text-green-700 dark:text-green-200" : evaluated ? "text-red-700 dark:text-red-200" : "text-muted-foreground"}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" focusable="false" />
              <span><span className="sr-only">{satisfied ? "Dipenuhi: " : evaluated ? "Belum dipenuhi: " : "Belum dinilai: "}</span>{label}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 border-t border-border pt-3">
        <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_6rem] items-baseline gap-2">
          <span className="text-sm font-medium">Kekuatan kata laluan</span>
          <span className={`text-right text-sm font-medium ${password ? STRENGTH_LABEL_CLASSES[strength.level] : "text-muted-foreground"}`} data-password-strength-label>
            {password ? strength.malayLabel : "Belum dinilai"}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1" data-password-strength-level={password ? strength.level : "none"} aria-hidden="true">
          {[0, 1, 2, 3, 4].map((segment) => (
            <span
              key={segment}
              data-password-strength-segment={segment}
              data-filled={segment < filledSegments ? "true" : "false"}
              className={`h-1.5 rounded-full ${segment < filledSegments
                ? STRENGTH_SEGMENT_CLASSES[strength.level]
                : "bg-slate-200 dark:bg-muted"}`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Anggaran kekuatan, bukan pengesahan syarat.</p>
        <p
          data-password-policy-status={valid ? "valid" : "incomplete"}
          className={`mt-1 min-h-10 text-sm leading-5 ${valid ? "text-green-700 dark:text-green-200" : evaluated ? "text-red-700 dark:text-red-200" : "text-muted-foreground"}`}
        >
          {policyMessage}
        </p>
      </div>
    </section>
  );
}
