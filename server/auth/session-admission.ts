import type { TwoFactorSessionExpectation } from "./two-factor";

/** Proof captured from the account snapshot whose password was verified. */
export type SessionAdmissionExpectation =
  | { kind: "password"; credentialState: string }
  | ({ kind: "two_factor" } & TwoFactorSessionExpectation);

// Preserve internal callers of the existing MFA repository operation. Normal
// login uses the discriminated expectation and must always supply its proof.
export type ActivityAdmissionExpectation = SessionAdmissionExpectation | TwoFactorSessionExpectation;
