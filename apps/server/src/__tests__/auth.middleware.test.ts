import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Response, NextFunction } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.middleware';

vi.mock('../lib/constants', () => ({ JWT_SECRET: 'test-secret' }));

describe('authMiddleware', () => {
  let req: Partial<AuthRequest>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { cookies: {} };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Partial<Response>;
    next = vi.fn();
  });

  it('returns 401 if no cookie is present', () => {
    authMiddleware(req as AuthRequest, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if token is malformed', () => {
    req.cookies = { token: 'bad-token' };
    authMiddleware(req as AuthRequest, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and sets req.user for a valid token', () => {
    const user = { id: 'user-1', email: 'a@b.com', name: 'Alice' };
    const token = jwt.sign(user, 'test-secret');
    req.cookies = { token };

    authMiddleware(req as AuthRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.user?.id).toBe('user-1');
  });

  it('returns 401 if token payload has no id', () => {
    const token = jwt.sign({ email: 'a@b.com' }, 'test-secret');
    req.cookies = { token };
    authMiddleware(req as AuthRequest, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
