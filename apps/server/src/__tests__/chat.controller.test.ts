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
  chatRequests: { findFirst: vi.fn() },
  invites: { findFirst: vi.fn() },
  messages: { findFirst: vi.fn() },
};

vi.mock('../lib/constants', () => ({ getDb: () => mockDb }));

vi.mock('@connext/db', () => ({
  users: {},
  messages: {},
  chatRequests: {},
  invites: {},
  getRoomId: vi.fn((a: string, b: string) => [a, b].sort().join('_')),
  isParticipantRoomId: vi.fn((roomId: string, userId: string) => roomId.includes(userId)),
}));

// Extend real crypto with mocked randomBytes
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('crypto');
  return {
    ...actual,
    randomBytes: vi.fn(() => Buffer.from('abcdef1234567890abcdef1234567890', 'hex')),
  };
});

function makeReq(overrides?: Partial<AuthRequest>): AuthRequest {
  return { user: { id: 'user-1' }, body: {}, params: {}, query: {}, ...overrides } as unknown as AuthRequest;
}
function makeRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const alice = { id: 'user-1', email: 'a@b.com', name: 'Alice', username: 'alice', displayName: 'Alice', avatarUrl: null, image: null };
const bob = { id: 'user-2', email: 'b@b.com', name: 'Bob', username: 'bob', displayName: 'Bob', avatarUrl: null, image: null };

describe('chat controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const m of ['select', 'from', 'where', 'insert', 'values', 'returning', 'update', 'set', 'delete', 'orderBy', 'limit', 'offset']) {
      mockDb[m].mockReturnValue(mockDb);
    }
  });

  describe('sendRequest', () => {
    it('returns 401 if no authenticated user', async () => {
      const { sendRequest } = await import('../controllers/chat.controller');
      const res = makeRes();
      await sendRequest(makeReq({ user: undefined }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 if no recipient provided', async () => {
      const { sendRequest } = await import('../controllers/chat.controller');
      mockDb.query.users.findFirst.mockResolvedValueOnce(alice);
      const res = makeRes();
      await sendRequest(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 if sender not in DB', async () => {
      const { sendRequest } = await import('../controllers/chat.controller');
      mockDb.query.users.findFirst.mockResolvedValueOnce(null);
      const res = makeRes();
      await sendRequest(makeReq({ body: { toUserId: 'user-2' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('respondToRequest', () => {
    it('returns 401 if no user', async () => {
      const { respondToRequest } = await import('../controllers/chat.controller');
      const res = makeRes();
      await respondToRequest(makeReq({ user: undefined }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 for invalid status', async () => {
      const { respondToRequest } = await import('../controllers/chat.controller');
      const res = makeRes();
      await respondToRequest(makeReq({ body: { requestId: 'req-1', status: 'invalid' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
