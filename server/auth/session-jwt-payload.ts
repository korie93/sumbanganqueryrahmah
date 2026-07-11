import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const optionalNonEmptyString = nonEmptyString.optional();
const jwtNumericDate = z.number().int().nonnegative().optional();

export const authenticatedSessionJwtPayloadSchema = z.object({
  userId: nonEmptyString,
  username: nonEmptyString,
  role: nonEmptyString,
  activityId: nonEmptyString,
  jti: optionalNonEmptyString,
  status: optionalNonEmptyString,
  mustChangePassword: z.boolean().optional(),
  passwordResetBySuperuser: z.boolean().optional(),
  isBanned: z.boolean().nullable().optional(),
  sessionExpiresAt: z.string().trim().min(1).nullable().optional(),
  iat: jwtNumericDate,
  exp: jwtNumericDate,
  nbf: jwtNumericDate,
}).strict();

export const webSocketSessionJwtPayloadSchema = authenticatedSessionJwtPayloadSchema
  .pick({
    activityId: true,
    exp: true,
    iat: true,
    jti: true,
    nbf: true,
    role: true,
    userId: true,
    username: true,
  })
  .extend({
    jti: nonEmptyString,
    role: optionalNonEmptyString,
    userId: optionalNonEmptyString,
    username: optionalNonEmptyString,
  })
  .strict();

export type AuthenticatedSessionJwtPayload = z.infer<typeof authenticatedSessionJwtPayloadSchema>;
export type WebSocketSessionJwtPayload = z.infer<typeof webSocketSessionJwtPayloadSchema>;

function createInvalidSessionPayloadError() {
  return new Error("Invalid session JWT payload.");
}

export function parseAuthenticatedSessionJwtPayload(payload: unknown): AuthenticatedSessionJwtPayload {
  const result = authenticatedSessionJwtPayloadSchema.safeParse(payload);
  if (!result.success) {
    throw createInvalidSessionPayloadError();
  }

  return result.data;
}

export function parseWebSocketSessionJwtPayload(payload: unknown): WebSocketSessionJwtPayload {
  const result = webSocketSessionJwtPayloadSchema.safeParse(payload);
  if (!result.success) {
    throw createInvalidSessionPayloadError();
  }

  return result.data;
}
