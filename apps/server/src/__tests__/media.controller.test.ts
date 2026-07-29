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
mockDb.query = { chatRequests: { findFirst: vi.fn() }, users: { findFirst: vi.fn() } };

vi.mock('../lib/constants', () => ({ getDb: () => mockDb }));
vi.mock('@connext/db', () => ({ chatRequests: {}, users: {} }));

const mockSend = vi.fn();
vi.mock('../lib/r2', () => ({
  getR2Client: vi.fn(() => ({ send: mockSend })),
  R2_BUCKET: 'test-bucket',
  isR2Configured: vi.fn(() => true),
}));

// Mock AWS SDK commands and getSignedUrl
vi.mock('@aws-sdk/client-s3', () => ({ GetObjectCommand: vi.fn(), PutObjectCommand: vi.fn() }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn(() => Promise.resolve('https://signed.url')) }));

function makeReq(overrides?: Partial<AuthRequest>): AuthRequest {
  return { user: { id: 'user-1' }, body: {}, params: {}, ...overrides } as unknown as AuthRequest;
}
function makeRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('media controller', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('buildObjectKey', () => {
    it('generates a key with userId, timestamp, and safe filename', async () => {
      const { buildObjectKey } = await import('../controllers/media.controller');
      const key = buildObjectKey('user-1', 'my file.png');
      expect(key).toMatch(/^chat-media\/user-1\/\d+-my_file\.png$/);
    });
  });

  describe('signUploadUrl', () => {
    it('returns 400 when required fields missing', async () => {
      const { signUploadUrl } = await import('../controllers/media.controller');
      const res = makeRes();
      await signUploadUrl(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 413 for oversized files', async () => {
      const { signUploadUrl } = await import('../controllers/media.controller');
      const res = makeRes();
      await signUploadUrl(makeReq({ body: { fileName: 'test.png', contentType: 'image/png', size: 999999999 } }), res);
      expect(res.status).toHaveBeenCalledWith(413);
    });

    it('returns a signed URL for valid uploads', async () => {
      const { signUploadUrl } = await import('../controllers/media.controller');
      const res = makeRes();
      await signUploadUrl(makeReq({ body: { fileName: 'test.png', contentType: 'image/png', size: 1024 } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ uploadUrl: 'https://signed.url' }));
    });
  });

  describe('proxyUpload', () => {
    it('returns 400 if no file uploaded', async () => {
      const { proxyUpload } = await import('../controllers/media.controller');
      const res = makeRes();
      await proxyUpload(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
