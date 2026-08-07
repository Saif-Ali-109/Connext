import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';

function chain() {
  const c: any = {};
  const methods = ['select', 'from', 'where', 'insert', 'values', 'returning', 'update', 'set', 'delete'];
  for (const m of methods) c[m] = vi.fn(() => c);
  return c;
}

const mockDb = chain();
mockDb.query = { users: { findFirst: vi.fn() } };

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
vi.mock('../lib/username', () => ({ generateUniqueUsername: vi.fn() }));

function makeReq(overrides?: Partial<AuthRequest>): AuthRequest {
  return { user: { id: 'user-1' }, body: {}, params: {}, query: {}, cookies: {}, ...overrides } as unknown as AuthRequest;
}
function makeRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}

describe('updateUsername — passwordless rename', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const m of ['select', 'from', 'where', 'insert', 'values', 'returning', 'update', 'set', 'delete']) {
      mockDb[m].mockReturnValue(mockDb);
    }
  });

  it('lets a Google user (username set, no password) rename WITHOUT a password', async () => {
    const { updateUsername } = await import('../controllers/auth.controller');
    // existing user: has a username, no passwordHash
    mockDb.query.users.findFirst
      .mockResolvedValueOnce({ id: 'user-1', username: 'saif_ali', passwordHash: null }) // existing lookup
      .mockResolvedValueOnce(undefined); // taken-check: new name free
    mockDb.returning.mockResolvedValueOnce([{ id: 'user-1', username: 'saif_new', passwordHash: null }]);

    const res = makeRes();
    await updateUsername(makeReq({ body: { username: 'saif_new' } }), res);

    // Success (200 via sendSuccess -> res.json), and NO password was hashed / set.
    expect(res.status).not.toHaveBeenCalledWith(400);
    const setArg = mockDb.set.mock.calls[0]?.[0] ?? {};
    expect(setArg).not.toHaveProperty('passwordHash');
    expect(setArg.username).toBe('saif_new');
  });

  it('still REQUIRES a password for a first-time set (no username, no password)', async () => {
    const { updateUsername } = await import('../controllers/auth.controller');
    mockDb.query.users.findFirst.mockResolvedValueOnce({ id: 'user-1', username: null, passwordHash: null });

    const res = makeRes();
    await updateUsername(makeReq({ body: { username: 'brandnew' } }), res); // no password in body

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('sets the password on a first-time set when one is provided', async () => {
    const { updateUsername } = await import('../controllers/auth.controller');
    mockDb.query.users.findFirst
      .mockResolvedValueOnce({ id: 'user-1', username: null, passwordHash: null }) // existing
      .mockResolvedValueOnce(undefined); // taken-check free
    mockDb.returning.mockResolvedValueOnce([{ id: 'user-1', username: 'brandnew', passwordHash: 'salt:pw' }]);

    const res = makeRes();
    await updateUsername(makeReq({ body: { username: 'brandnew', password: 'longenough8' } }), res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const setArg = mockDb.set.mock.calls[0]?.[0] ?? {};
    expect(setArg).toHaveProperty('passwordHash');
  });

  it('returns 409 when the new username is already taken by someone else', async () => {
    const { updateUsername } = await import('../controllers/auth.controller');
    mockDb.query.users.findFirst
      .mockResolvedValueOnce({ id: 'user-1', username: 'saif_ali', passwordHash: null }) // existing
      .mockResolvedValueOnce({ id: 'user-2', username: 'taken_name' }); // taken by another user

    const res = makeRes();
    await updateUsername(makeReq({ body: { username: 'taken_name' } }), res);

    expect(res.status).toHaveBeenCalledWith(409);
  });
});
