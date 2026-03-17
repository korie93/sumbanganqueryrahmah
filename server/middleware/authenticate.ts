import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { clearAuthSessionCookie, readAuthSessionTokenFromHeaders } from "../auth/session-cookie";
import { PostgresStorage } from "../storage-postgres";
import { getSessionSecret } from "../config/security";

const storage = new PostgresStorage();
const JWT_SECRET = getSessionSecret();

export interface AuthenticatedRequest extends Request {
  user?: {
    username: string;
    role: string;
    activityId: string;
  };
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = readAuthSessionTokenFromHeaders(req.headers);
  if (!token) {
    clearAuthSessionCookie(res);
    return res.status(401).json({ message: "Token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as any;
    const activity = await storage.getActivityById(decoded.activityId);

    if (!activity || activity.isActive === false || activity.logoutTime !== null) {
      clearAuthSessionCookie(res);
      return res.status(401).json({ message: "Session expired", forceLogout: true });
    }

    req.user = decoded;
    next();
  } catch {
    clearAuthSessionCookie(res);
    return res.status(403).json({ message: "Invalid token" });
  }
}
