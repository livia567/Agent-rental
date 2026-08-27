import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthUser {
  userId: number;
  username: string;
}

export function signToken(user: AuthUser): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET 未配置");
  return jwt.sign(user, secret, { expiresIn: "7d" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ success: false, error: "请先登录" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
    next();
  } catch {
    res.status(401).json({ success: false, error: "登录已过期，请重新登录" });
  }
}
