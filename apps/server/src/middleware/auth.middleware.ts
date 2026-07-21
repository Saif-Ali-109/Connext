import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../lib/constants';

export interface AuthUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    if (!decoded?.id) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const authenticateToken = authMiddleware;
