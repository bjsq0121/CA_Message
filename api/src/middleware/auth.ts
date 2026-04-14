import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId?: string;
  userNm?: string;
}

const JWT_SECRET = process.env.JWT_SECRET ?? "";

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.userId = decoded.sub ?? decoded.userId ?? decoded.user_id;
    req.userNm = decoded.userNm ?? decoded.name;

    if (!req.userId) {
      res.status(401).json({ error: "Invalid token: no userId" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
