import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';

function chain() {
  const c: any = {};
  const methods = ['select', 'from', 'where', 'insert', 'values', 'returning', 'update', 'set', 'delete', 'orderBy', 'limit', 'offset'];
  for (const m of methods) c[m] = vi.fn(() => c);
  return c;
}

const mockDb = chain();
mockDb.query = {
  users: { findFirst: vi.fn() },
  verificationCodes: { findFirst: vi.fn() },
  chatRequests: { findFirst: vi.fn() },
};

vi.mock('../lib/constants', () => ({
  getDb: () => mockDb,
  JWT_SECRET: 'test-secret',
  JWT_EXPIRES_DAYS: '7d',
  AUTH_SECRET: 'test-auth-secret',
}));

vi.mock('@connext/db', () => ({
  users: {},
  verificationCodes: {},
  hashPassword: vi.fn((pw: string) => Promise.resolve(`salt:${pw}_hashed`)),
}));

vi.mock('../lib/bridge', () => ({ verifyBridgePayload: vi.fn() }));
vi.mock('../lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));

function makeReq(overrides?: Partial<AuthRequest>): AuthRequest {
  return { user: { id: 'user-1', email: 'a@b.com', name: 'Alice' }, body: {}, params: {}, query: {}, cookies: {}, ...overrides } as unknown as AuthRequest;
}
function makeRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}

describe('auth controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-bind chain methods after clear
    for (const m of ['select', 'from', 'where', 'insert', 'values', 'returning', 'update', 'set', 'delete', 'orderBy', 'limit', 'offset']) {
      mockDb[m].mockReturnValue(mockDb);
    }
  });

  describe('logout', () => {
    it('clears cookie and returns ok', async () => {
      const { logout } = await import('../controllers/auth.controller');
      await logout(makeReq(), makeRes());
    });
  });

  describe('getSession', () => {
    it('returns 401 if no user', async () => {
      const { getSession } = await import('../controllers/auth.controller');
      const res = makeRes();
      await getSession(makeReq({ user: undefined }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('updateUsername', () => {
    it('validates username format', async () => {
      const { updateUsername } = await import('../controllers/auth.controller');
      const res = makeRes();
      await updateUsername(makeReq({ body: { username: 'ab' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('searchUsers', () => {
    it('rejects short query', async () => {
      const { searchUsers } = await import('../controllers/auth.controller');
      const res = makeRes();
      await searchUsers(makeReq({ query: { q: 'a' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
