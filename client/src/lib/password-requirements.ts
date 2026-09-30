import {
  assessCredentialPassword,
  CREDENTIAL_PASSWORD_MAX_LENGTH,
  CREDENTIAL_PASSWORD_MIN_LENGTH,
  type CredentialPasswordIssueCode,
} from "@shared/password-policy";

/** Groups the authoritative checks for display without introducing new password rules. */
export function getPasswordRequirements(password: string, locale: "ms" | "en" = "ms") {
  const assessment = assessCredentialPassword(password);
  const passed = (code: CredentialPasswordIssueCode) =>
    assessment.checks.some((check) => check.code === code && check.valid);
  const requirements = [
    {
      id: "length",
      label: locale === "en" ? `Between ${CREDENTIAL_PASSWORD_MIN_LENGTH} and ${CREDENTIAL_PASSWORD_MAX_LENGTH} characters` : `Antara ${CREDENTIAL_PASSWORD_MIN_LENGTH} hingga ${CREDENTIAL_PASSWORD_MAX_LENGTH} aksara`,
      satisfied: passed("PASSWORD_TOO_SHORT") && passed("PASSWORD_TOO_LONG"),
    },
    {
      id: "lowercase",
      label: locale === "en" ? "Lowercase letter (a–z)" : "Huruf kecil (a–z)",
      satisfied: passed("PASSWORD_MISSING_LOWERCASE") && passed("PASSWORD_MISSING_LETTER"),
    },
    {
      id: "uppercase",
      label: locale === "en" ? "Uppercase letter (A–Z)" : "Huruf besar (A–Z)",
      satisfied: passed("PASSWORD_MISSING_UPPERCASE") && passed("PASSWORD_MISSING_LETTER"),
    },
    { id: "number", label: locale === "en" ? "Number (0–9)" : "Nombor (0–9)", satisfied: passed("PASSWORD_MISSING_NUMBER") },
    { id: "symbol", label: locale === "en" ? "Symbol (for example: ! @ #)" : "Simbol (contoh: ! @ #)", satisfied: passed("PASSWORD_MISSING_SYMBOL") },
  ];
  return {
    valid: assessment.valid,
    requirements,
    satisfiedCount: requirements.filter((requirement) => requirement.satisfied).length,
  };
}
