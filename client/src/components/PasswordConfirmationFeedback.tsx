type PasswordConfirmationFeedbackProps = {
  id: string;
  password: string;
  confirmation: string;
  requiredError?: string | null;
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
}: PasswordConfirmationFeedbackProps) {
  const feedback = getPasswordConfirmationFeedback(password, confirmation);
  const message = feedback?.message || (!confirmation ? requiredError : "");
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
