import { ensureObject } from "../../http/validation";

export function readLoginBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    username: String(body.username ?? ""),
    password: String(body.password ?? ""),
    fingerprint: typeof body.fingerprint === "string" ? body.fingerprint : null,
    pcName: typeof body.pcName === "string" ? body.pcName : null,
    browser: typeof body.browser === "string" ? body.browser : null,
  };
}

export function readActivationBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    username: body.username == null ? undefined : String(body.username),
    token: String(body.token ?? ""),
    newPassword: String(body.newPassword ?? ""),
    confirmPassword: String(body.confirmPassword ?? ""),
  };
}

export function readTokenBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    token: String(body.token ?? ""),
  };
}

export function readPasswordResetRequestBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    identifier: String(body.identifier ?? body.username ?? body.email ?? ""),
  };
}

export function readPasswordChangeBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    currentPassword: String(body.currentPassword ?? ""),
    newPassword: String(body.newPassword ?? ""),
  };
}

export function readTwoFactorChallengeBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    challengeToken: String(body.challengeToken ?? ""),
    code: String(body.code ?? ""),
  };
}

export function readTwoFactorSetupBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    currentPassword: String(body.currentPassword ?? ""),
  };
}

export function readTwoFactorCodeBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    code: String(body.code ?? ""),
  };
}

export function readTwoFactorDisableBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    currentPassword: String(body.currentPassword ?? ""),
    code: String(body.code ?? ""),
  };
}

export function readOwnCredentialPatchBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    body,
    hasUsernameField: Object.prototype.hasOwnProperty.call(body, "newUsername"),
    hasPasswordField:
      Object.prototype.hasOwnProperty.call(body, "newPassword")
      || Object.prototype.hasOwnProperty.call(body, "currentPassword"),
    newUsername: body.newUsername !== undefined ? String(body.newUsername ?? "") : undefined,
    currentPassword: String(body.currentPassword ?? ""),
    newPassword: String(body.newPassword ?? ""),
  };
}

export function readManagedUserBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    username: String(body.username ?? ""),
    fullName: body.fullName == null ? null : String(body.fullName),
    email: body.email == null ? null : String(body.email),
    role: String(body.role ?? "user"),
  };
}

export function readManagedUserPatchBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    username: body.username !== undefined ? String(body.username) : undefined,
    fullName: body.fullName !== undefined ? String(body.fullName ?? "") : undefined,
    email: body.email !== undefined ? String(body.email ?? "") : undefined,
  };
}

export function readManagedUserRoleBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    role: String(body.role ?? ""),
  };
}

export function readManagedUserStatusBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    status: body.status !== undefined ? String(body.status) : undefined,
    isBanned: body.isBanned === undefined ? undefined : Boolean(body.isBanned),
  };
}

export function readManagedCredentialsBody(bodyRaw: unknown) {
  const body = ensureObject(bodyRaw) || {};
  return {
    newPassword: String(body.newPassword ?? ""),
    newUsername: body.newUsername !== undefined ? String(body.newUsername) : undefined,
  };
}
