import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
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
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token required" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const activity = await storage.getActivityById(decoded.activityId);

    if (!activity || activity.isActive === false || activity.logoutTime !== null) {
      return res.status(401).json({ message: "Session expired", forceLogout: true });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ message: "Invalid token" });
  }
}
