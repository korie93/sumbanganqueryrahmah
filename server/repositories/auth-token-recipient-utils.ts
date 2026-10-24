import { ERROR_CODES } from "../../shared/error-codes";
import { conflict } from "../http/errors";
import { normalizeOptionalAuthEmail } from "./auth-user-repository-normalize";

/** Call only after locking the user, before replacing or issuing a link. */
export function assertAuthTokenRecipient(
  target: { email: string | null; status: string | null } | undefined,
  expectedRecipientEmail: unknown,
): void {
  const expected = typeof expectedRecipientEmail === "string"
    ? normalizeOptionalAuthEmail(expectedRecipientEmail)
    : null;
  if (!target || target.status === "deleted" || !expected
    || normalizeOptionalAuthEmail(target.email) !== expected) {
    throw conflict("Account email changed. Refresh the account before sending a new link.", ERROR_CODES.CONFLICT);
  }
}
