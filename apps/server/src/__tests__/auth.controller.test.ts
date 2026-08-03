import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import crypto from 'crypto';
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
  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-bind chain methods after clear
    for (const m of ['select', 'from', 'where', 'insert', 'values', 'returning', 'update', 'set', 'delete', 'orderBy', 'limit', 'offset']) {
      mockDb[m].mockReturnValue(mockDb);
    }
    // Reset the module-level key-update notifier so tests don't leak into each other.
    const { setKeyUpdateNotifier } = await import('../controllers/auth.controller');
    setKeyUpdateNotifier(undefined);
  });

  let rsa: { publicKeyB64: string; privateKey: crypto.KeyObject; fingerprint: string };
  let signNonce: (nonce: string) => string;

  beforeAll(() => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicExponent: 0x10001,
    });
    const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
    rsa = {
      publicKeyB64: spkiDer.toString('base64'),
      privateKey,
      fingerprint: crypto.createHash('sha256').update(spkiDer).digest('hex'),
    };
    signNonce = (nonce: string) =>
      crypto.sign('sha256', Buffer.from(nonce), privateKey).toString('base64');
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

  describe('uploadPublicKey', () => {
    it('returns 401 if no user', async () => {
      const { uploadPublicKey } = await import('../controllers/auth.controller');
      const res = makeRes();
      await uploadPublicKey(makeReq({ user: undefined }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 if fields missing', async () => {
      const { uploadPublicKey } = await import('../controllers/auth.controller');
      const res = makeRes();
      await uploadPublicKey(makeReq({ body: { publicKey: rsa.publicKeyB64 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects a signature that does not prove possession with 403', async () => {
      const { uploadPublicKey } = await import('../controllers/auth.controller');
      const res = makeRes();
      await uploadPublicKey(
        makeReq({
          body: {
            publicKey: rsa.publicKeyB64,
            fingerprint: rsa.fingerprint,
            nonce: 'nonce-123',
            signature: signNonce('a-different-nonce'),
          },
        }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('accepts a valid signature and persists fingerprint', async () => {
      const { uploadPublicKey } = await import('../controllers/auth.controller');
      const res = makeRes();
      const nonce = 'nonce-456';
      await uploadPublicKey(
        makeReq({
          body: {
            publicKey: rsa.publicKeyB64,
            fingerprint: rsa.fingerprint,
            nonce,
            signature: signNonce(nonce),
          },
        }),
        res
      );
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: rsa.publicKeyB64,
          keyFingerprint: rsa.fingerprint,
        })
      );
      expect(res.json).toHaveBeenCalledWith({ ok: true, fingerprint: rsa.fingerprint });
    });

    it('notifies contacts after a successful key rotation', async () => {
      const { uploadPublicKey, setKeyUpdateNotifier } = await import('../controllers/auth.controller');
      const notify = vi.fn().mockResolvedValue(undefined);
      setKeyUpdateNotifier(notify);
      const res = makeRes();
      const nonce = 'nonce-789';
      await uploadPublicKey(
        makeReq({
          body: {
            publicKey: rsa.publicKeyB64,
            fingerprint: rsa.fingerprint,
            nonce,
            signature: signNonce(nonce),
          },
        }),
        res
      );
      expect(notify).toHaveBeenCalledWith('user-1');
      expect(res.json).toHaveBeenCalledWith({ ok: true, fingerprint: rsa.fingerprint });
    });

    it('skips notifying contacts when the key is unchanged (idempotent re-upload)', async () => {
      const { uploadPublicKey, setKeyUpdateNotifier } = await import('../controllers/auth.controller');
      const notify = vi.fn().mockResolvedValue(undefined);
      setKeyUpdateNotifier(notify);
      mockDb.query.users.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        keyFingerprint: rsa.fingerprint,
      });
      const res = makeRes();
      const nonce = 'nonce-111';
      await uploadPublicKey(
        makeReq({
          body: {
            publicKey: rsa.publicKeyB64,
            fingerprint: rsa.fingerprint,
            nonce,
            signature: signNonce(nonce),
          },
        }),
        res
      );
      expect(notify).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ ok: true, fingerprint: rsa.fingerprint });
    });
  });

  describe('getKeyStatus', () => {
    it('returns 401 if no user', async () => {
      const { getKeyStatus } = await import('../controllers/auth.controller');
      const res = makeRes();
      await getKeyStatus(makeReq({ user: undefined }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns stored publicKey and fingerprint', async () => {
      const { getKeyStatus } = await import('../controllers/auth.controller');
      mockDb.query.users.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        publicKey: rsa.publicKeyB64,
        keyFingerprint: rsa.fingerprint,
      });
      const res = makeRes();
      await getKeyStatus(makeReq(), res);
      expect(res.json).toHaveBeenCalledWith({
        publicKey: rsa.publicKeyB64,
        fingerprint: rsa.fingerprint,
      });
    });

    it('returns nulls when no key is stored', async () => {
      const { getKeyStatus } = await import('../controllers/auth.controller');
      mockDb.query.users.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        publicKey: null,
        keyFingerprint: null,
      });
      const res = makeRes();
      await getKeyStatus(makeReq(), res);
      expect(res.json).toHaveBeenCalledWith({ publicKey: null, fingerprint: null });
    });
  });
});
