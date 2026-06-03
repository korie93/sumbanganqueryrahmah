import { evaluatePasswordStrength } from "@/lib/password-strength";

type PasswordStrengthMeterProps = {
  className?: string;
  id?: string;
  password: string;
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
}: PasswordStrengthMeterProps) {
  const evaluation = evaluatePasswordStrength(password);
  const filledSegments = password.length > 0 ? evaluation.level + 1 : 0;
  const activeSegmentClass = SEGMENT_ACTIVE_CLASSES[evaluation.level];
  const labelClass = LABEL_CLASSES[evaluation.level];

  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      aria-label={evaluation.ariaLabel}
      className={`rounded-lg border border-slate-200/80 bg-white/70 p-3 text-xs text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/50 dark:text-slate-300 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-slate-700 dark:text-slate-200">
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
                : "bg-slate-200/80 dark:bg-slate-700/70"
            }`}
          />
        ))}
      </div>
      {evaluation.feedback.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-slate-500 dark:text-slate-400">
          {evaluation.feedback.slice(0, 3).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-green-700 dark:text-green-200">
          Memenuhi polisi asas kata laluan.
        </p>
      )}
    </div>
  );
}
