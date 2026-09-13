import { CheckCircle2, CircleAlert } from "lucide-react";

type PasswordConfirmationFeedbackProps = {
  id: string;
  password: string;
  confirmation: string;
  requiredError?: string | null;
  variant?: "default" | "enhanced";
};

export function getPasswordConfirmationFeedback(password: string, confirmation: string) {
  if (!confirmation) return null;
  return password === confirmation
    ? { matches: true, message: "Pengesahan kata laluan sepadan." }
    : { matches: false, message: "Pengesahan kata laluan tidak sepadan." };
}

/** Match feedback is separate from password validity: matching weak passwords remain invalid. */
export function PasswordConfirmationFeedback({
  id,
  password,
  confirmation,
  requiredError,
  variant = "default",
}: PasswordConfirmationFeedbackProps) {
  const feedback = getPasswordConfirmationFeedback(password, confirmation);
  const message = feedback?.message || (!confirmation ? requiredError : "");
  if (variant === "enhanced") {
    const enhancedMessage = requiredError || message;
    const matches = Boolean(feedback?.matches && !requiredError);
    return (
      <p
        id={id}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`flex min-h-10 items-start gap-2 text-sm leading-5 ${matches ? "text-green-700 dark:text-green-200" : "text-destructive"}`}
      >
        {enhancedMessage ? (
          <>
            {matches
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" focusable="false" />
              : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" focusable="false" />}
            <span>{enhancedMessage}</span>
          </>
        ) : null}
      </p>
    );
  }
  return (
    <p
      id={id}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`text-xs ${feedback?.matches ? "text-green-700 dark:text-green-200" : "text-destructive"}`}
    >
      {message || null}
    </p>
  );
}
