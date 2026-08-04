import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import { messages, chatClears } from '@connext/db';

function chain() {
  const c: any = {};
  const methods = ['select', 'from', 'where', 'insert', 'values', 'returning', 'update', 'set', 'delete', 'orderBy', 'limit', 'offset', 'leftJoin', 'onConflictDoUpdate'];
  for (const m of methods) c[m] = vi.fn(() => c);
  return c;
}

const mockDb = chain();
mockDb.query = {
  users: { findFirst: vi.fn() },
  chatRequests: { findFirst: vi.fn() },
  invites: { findFirst: vi.fn() },
  messages: { findFirst: vi.fn() },
  chatClears: { findFirst: vi.fn() },
};

vi.mock('../lib/constants', () => ({ getDb: () => mockDb }));

vi.mock('@connext/db', () => ({
  users: {},
  messages: {},
  chatRequests: {},
  chatClears: {},
  invites: {},
  getRoomId: vi.fn((a: string, b: string) => [a, b].sort().join('_')),
  isParticipantRoomId: vi.fn((roomId: string, userId: string) =>
    roomId.split('_').includes(userId)
  ),
  isHiddenBy: (hiddenBy: string[] | null | undefined, userId: string) =>
    (hiddenBy ?? []).includes(userId),
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

function sqlContainsValue(node: unknown, value: string): boolean {
  if (node === null || typeof node !== 'object') return false;
  const n = node as Record<string, unknown>;
  if (n.value === value) return true;
  const chunks = Array.isArray(n.queryChunks)
    ? n.queryChunks
    : Array.isArray(n.chunks)
      ? n.chunks
      : null;
  if (chunks) return chunks.some((c: unknown) => sqlContainsValue(c, value));
  return false;
}

const alice = { id: 'user-1', email: 'a@b.com', name: 'Alice', username: 'alice', displayName: 'Alice', avatarUrl: null, image: null };
const bob = { id: 'user-2', email: 'b@b.com', name: 'Bob', username: 'bob', displayName: 'Bob', avatarUrl: null, image: null };

describe('chat controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const m of ['select', 'from', 'where', 'insert', 'values', 'returning', 'update', 'set', 'delete', 'orderBy', 'limit', 'offset', 'leftJoin', 'onConflictDoUpdate']) {
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

  describe('toggleReaction', () => {
    function mockMessageRow(row: Record<string, unknown>) {
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([row]),
          }),
        }),
      });
    }

    function mockUpdateResult(row: Record<string, unknown> | unknown[]) {
      mockDb.update.mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            returning: vi.fn().mockResolvedValueOnce(
              Array.isArray(row) ? row : [row]
            ),
          }),
        }),
      });
    }

    it('returns 401 if no authenticated user', async () => {
      const { toggleReaction } = await import('../controllers/chat.controller');
      const res = makeRes();
      await toggleReaction(makeReq({ user: undefined }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 if messageId or emoji is missing', async () => {
      const { toggleReaction } = await import('../controllers/chat.controller');
      const res = makeRes();
      await toggleReaction(makeReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects reacting to your own message with 403', async () => {
      const { toggleReaction } = await import('../controllers/chat.controller');
      const res = makeRes();
      mockMessageRow({ id: 'm1', senderId: 'user-1', roomId: 'user-1_user-2' });
      await toggleReaction(makeReq({ body: { messageId: 'm1', emoji: '👍' } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('rejects reacting to a message outside your rooms with 403', async () => {
      const { toggleReaction } = await import('../controllers/chat.controller');
      const res = makeRes();
      mockMessageRow({ id: 'm1', senderId: 'user-9', roomId: 'user-8_user-9' });
      await toggleReaction(makeReq({ body: { messageId: 'm1', emoji: '👍' } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('returns 404 if message does not exist', async () => {
      const { toggleReaction } = await import('../controllers/chat.controller');
      const res = makeRes();
      mockMessageRow(null as unknown as Record<string, unknown>);
      await toggleReaction(makeReq({ body: { messageId: 'missing', emoji: '👍' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 for an empty emoji', async () => {
      const { toggleReaction } = await import('../controllers/chat.controller');
      const res = makeRes();
      await toggleReaction(makeReq({ body: { messageId: 'm1', emoji: '   ' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('adds the reaction when the recipient reacts', async () => {
      const { toggleReaction } = await import('../controllers/chat.controller');
      const res = makeRes();
      mockMessageRow({ id: 'm1', senderId: 'user-2', roomId: 'user-1_user-2', reaction: null, reactedByUserId: null });
      mockUpdateResult({ id: 'm1', senderId: 'user-2', roomId: 'user-1_user-2', reaction: '👍', reactedByUserId: 'user-1' });
      await toggleReaction(makeReq({ body: { messageId: 'm1', emoji: '👍' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'm1', emoji: '👍', userId: 'user-1', action: 'added' })
      );
    });

    it('clears the reaction when toggling the same emoji (mine)', async () => {
      const { toggleReaction } = await import('../controllers/chat.controller');
      const res = makeRes();
      mockMessageRow({ id: 'm1', senderId: 'user-2', roomId: 'user-1_user-2', reaction: '👍', reactedByUserId: 'user-1' });
      mockUpdateResult({ id: 'm1', senderId: 'user-2', roomId: 'user-1_user-2', reaction: null, reactedByUserId: null });
      await toggleReaction(makeReq({ body: { messageId: 'm1', emoji: '👍' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ emoji: null, action: 'removed' })
      );
    });

    it('replaces the reaction when a different emoji is picked', async () => {
      const { toggleReaction } = await import('../controllers/chat.controller');
      const res = makeRes();
      mockMessageRow({ id: 'm1', senderId: 'user-2', roomId: 'user-1_user-2', reaction: '👍', reactedByUserId: 'user-1' });
      mockUpdateResult({ id: 'm1', senderId: 'user-2', roomId: 'user-1_user-2', reaction: '❤️', reactedByUserId: 'user-1' });
      await toggleReaction(makeReq({ body: { messageId: 'm1', emoji: '❤️' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ emoji: '❤️', action: 'changed' })
      );
    });

    it('returns 409 when the toggle keeps losing the race', async () => {
      const { toggleReaction } = await import('../controllers/chat.controller');
      const res = makeRes();
      const row = {
        id: 'm1',
        senderId: 'user-2',
        roomId: 'user-1_user-2',
        reaction: null,
        reactedByUserId: null,
      };
      for (let i = 0; i < 3; i++) {
        mockMessageRow(row);
        mockUpdateResult([]);
      }
      await toggleReaction(makeReq({ body: { messageId: 'm1', emoji: '👍' } }), res);
      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('sendMessage', () => {
    function mockInsertReturning() {
      let valuesArg: Record<string, unknown> | undefined;
      mockDb.values.mockImplementationOnce((v: Record<string, unknown>) => {
        valuesArg = v;
        return mockDb;
      });
      mockDb.returning.mockResolvedValueOnce([{ id: 'm1', senderId: 'user-1' }]);
      return () => valuesArg;
    }

    it('returns 401 if no authenticated user', async () => {
      const { sendMessage } = await import('../controllers/chat.controller');
      const res = makeRes();
      await sendMessage(makeReq({ user: undefined }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 if recipient missing', async () => {
      const { sendMessage } = await import('../controllers/chat.controller');
      const res = makeRes();
      await sendMessage(makeReq({ body: { content: 'hello' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 403 if senderId does not match authenticated user', async () => {
      const { sendMessage } = await import('../controllers/chat.controller');
      const res = makeRes();
      await sendMessage(
        makeReq({ body: { senderId: 'someone-else', recipientUserId: 'user-2', content: 'hello' } }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('persists null content and senderKeyFingerprint for encrypted messages', async () => {
      const { sendMessage } = await import('../controllers/chat.controller');
      const res = makeRes();
      mockDb.query.users.findFirst.mockResolvedValueOnce(bob);
      mockDb.query.chatRequests.findFirst.mockResolvedValueOnce({
        id: 'req-1',
        fromUserId: 'user-1',
        toUserId: 'user-2',
        status: 'accepted',
      });
      const getValuesArg = mockInsertReturning();

      await sendMessage(
        makeReq({
          body: {
            recipientUserId: 'user-2',
            encryptedContent: 'ciphertext',
            encryptedContentForSender: 'cipher-for-sender',
            senderKeyFingerprint: 'fp-1',
          },
        }),
        res
      );

      expect(getValuesArg()).toMatchObject({
        content: null,
        encryptedContent: 'ciphertext',
        encryptedContentForSender: 'cipher-for-sender',
        senderKeyFingerprint: 'fp-1',
      });
      expect(res.status).toHaveBeenCalledWith(202);
    });

    it('persists plain content when not encrypted', async () => {
      const { sendMessage } = await import('../controllers/chat.controller');
      const res = makeRes();
      mockDb.query.users.findFirst.mockResolvedValueOnce(bob);
      mockDb.query.chatRequests.findFirst.mockResolvedValueOnce({
        id: 'req-1',
        fromUserId: 'user-1',
        toUserId: 'user-2',
        status: 'accepted',
      });
      const getValuesArg = mockInsertReturning();

      await sendMessage(
        makeReq({ body: { recipientUserId: 'user-2', content: 'plain hello' } }),
        res
      );

      expect(getValuesArg()).toMatchObject({
        content: 'plain hello',
        encryptedContent: null,
        senderKeyFingerprint: null,
      });
      expect(res.status).toHaveBeenCalledWith(202);
    });

    it('returns 403 if the authenticated user is hidden by their contact', async () => {
      const { sendMessage } = await import('../controllers/chat.controller');
      const res = makeRes();
      mockDb.query.users.findFirst.mockResolvedValueOnce(bob);
      mockDb.query.chatRequests.findFirst.mockResolvedValueOnce({
        id: 'req-1',
        fromUserId: 'user-1',
        toUserId: 'user-2',
        status: 'accepted',
        hiddenBy: ['user-1'],
      });

      await sendMessage(
        makeReq({ body: { recipientUserId: 'user-2', content: 'hello' } }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('clearChatHistory', () => {
    it('returns 401 if no authenticated user', async () => {
      const { clearChatHistory } = await import('../controllers/chat.controller');
      const res = makeRes();
      await clearChatHistory(makeReq({ user: undefined }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 if roomId is missing', async () => {
      const { clearChatHistory } = await import('../controllers/chat.controller');
      const res = makeRes();
      await clearChatHistory(makeReq({ params: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 if roomId is not a participant room', async () => {
      const { clearChatHistory } = await import('../controllers/chat.controller');
      const res = makeRes();
      await clearChatHistory(makeReq({ params: { roomId: 'user-9_user-3' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 403 if no accepted connection exists for the room', async () => {
      const { clearChatHistory } = await import('../controllers/chat.controller');
      mockDb.query.chatRequests.findFirst.mockResolvedValueOnce(null);
      const res = makeRes();
      await clearChatHistory(makeReq({ params: { roomId: 'user-1_user-2' } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('deletes all messages in the room on success', async () => {
      const { clearChatHistory } = await import('../controllers/chat.controller');
      mockDb.query.chatRequests.findFirst.mockResolvedValueOnce({
        id: 'req-1',
        fromUserId: 'user-1',
        toUserId: 'user-2',
        status: 'accepted',
      });
      const res = makeRes();
      let whereArg: unknown;
      mockDb.where.mockImplementationOnce((arg: unknown) => {
        whereArg = arg;
        return mockDb;
      });

      await clearChatHistory(makeReq({ params: { roomId: 'user-1_user-2' } }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
      expect(mockDb.delete).toHaveBeenCalledWith(messages);
      expect(mockDb.where).toHaveBeenCalled();
      expect(sqlContainsValue(whereArg, 'user-1_user-2')).toBe(true);
    });

    it('invalidates the request cache for both participants', async () => {
      const { getRequests, clearChatHistory } = await import('../controllers/chat.controller');

      const mockSelectChain = () =>
        mockDb.select.mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockResolvedValueOnce([]),
          }),
        });

      mockSelectChain();
      const res1 = makeRes();
      await getRequests(makeReq(), res1);
      expect(res1.status).toHaveBeenCalledWith(200);

      mockDb.query.chatRequests.findFirst.mockResolvedValueOnce({
        id: 'req-1',
        fromUserId: 'user-1',
        toUserId: 'user-2',
        status: 'accepted',
      });
      const res2 = makeRes();
      await clearChatHistory(makeReq({ params: { roomId: 'user-1_user-2' } }), res2);
      expect(res2.status).toHaveBeenCalledWith(200);

      mockDb.select.mockClear();
      mockSelectChain();
      const res3 = makeRes();
      await getRequests(makeReq(), res3);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('clearChatForUser', () => {
    it('returns 401 if no authenticated user', async () => {
      const { clearChatForUser } = await import('../controllers/chat.controller');
      const res = makeRes();
      await clearChatForUser(makeReq({ user: undefined }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 if roomId is not a participant room', async () => {
      const { clearChatForUser } = await import('../controllers/chat.controller');
      const res = makeRes();
      await clearChatForUser(makeReq({ params: { roomId: 'user-9_user-3' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 403 if no accepted connection exists for the room', async () => {
      const { clearChatForUser } = await import('../controllers/chat.controller');
      mockDb.query.chatRequests.findFirst.mockResolvedValueOnce(null);
      const res = makeRes();
      await clearChatForUser(makeReq({ params: { roomId: 'user-1_user-2' } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('returns 403 if the authenticated user is hidden by their contact', async () => {
      const { clearChatForUser } = await import('../controllers/chat.controller');
      mockDb.query.chatRequests.findFirst.mockResolvedValueOnce({
        id: 'req-1',
        fromUserId: 'user-1',
        toUserId: 'user-2',
        status: 'accepted',
        hiddenBy: ['user-1'],
      });
      const res = makeRes();
      await clearChatForUser(makeReq({ params: { roomId: 'user-1_user-2' } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('upserts a chatClears marker without deleting messages on success', async () => {
      const { clearChatForUser } = await import('../controllers/chat.controller');
      mockDb.query.chatRequests.findFirst.mockResolvedValueOnce({
        id: 'req-1',
        fromUserId: 'user-1',
        toUserId: 'user-2',
        status: 'accepted',
      });
      const res = makeRes();
      await clearChatForUser(makeReq({ params: { roomId: 'user-1_user-2' } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
      expect(mockDb.insert).toHaveBeenCalledWith(chatClears);
      const updater = mockDb.onConflictDoUpdate.mock.calls[0][0];
      expect(updater).toEqual(
        expect.objectContaining({
          target: [chatClears.userId, chatClears.roomId],
          set: expect.objectContaining({ clearedAt: expect.any(Date) }),
        })
      );
      expect(mockDb.delete).not.toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    function mockMessagesQuery(resolveValue: unknown[]) {
      let whereArg: unknown;
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn((arg: unknown) => {
            whereArg = arg;
            return {
              orderBy: vi.fn().mockReturnValueOnce({
                limit: vi.fn().mockReturnValueOnce({
                  offset: vi.fn().mockResolvedValueOnce(resolveValue),
                }),
              }),
            };
          }),
        }),
      });
      return () => whereArg;
    }

    it('returns 401 if no authenticated user', async () => {
      const { getMessages } = await import('../controllers/chat.controller');
      const res = makeRes();
      await getMessages(makeReq({ user: undefined, params: { roomId: 'user-1_user-2' } }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 403 if no accepted connection exists for the room', async () => {
      const { getMessages } = await import('../controllers/chat.controller');
      mockDb.query.chatRequests.findFirst.mockResolvedValueOnce(null);
      const res = makeRes();
      await getMessages(makeReq({ params: { roomId: 'user-1_user-2' } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('excludes messages at or before the clearedAt marker', async () => {
      const { getMessages } = await import('../controllers/chat.controller');
      mockDb.query.chatRequests.findFirst.mockResolvedValueOnce({
        id: 'req-1',
        fromUserId: 'user-1',
        toUserId: 'user-2',
        status: 'accepted',
      });
      const clearedAt = new Date('2024-01-01T00:00:00Z');
      mockDb.query.chatClears.findFirst.mockResolvedValueOnce({
        id: 'c1',
        userId: 'user-1',
        roomId: 'user-1_user-2',
        clearedAt,
      });
      const getWhereArg = mockMessagesQuery([]);
      const res = makeRes();
      await getMessages(makeReq({ params: { roomId: 'user-1_user-2' } }), res);
      expect(mockDb.query.chatClears.findFirst).toHaveBeenCalled();
      expect(sqlContainsValue(getWhereArg(), clearedAt)).toBe(true);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ messages: [], totalCount: 0 }));
    });

    it('returns messages when no clear marker exists', async () => {
      const { getMessages } = await import('../controllers/chat.controller');
      mockDb.query.chatRequests.findFirst.mockResolvedValueOnce({
        id: 'req-1',
        fromUserId: 'user-1',
        toUserId: 'user-2',
        status: 'accepted',
      });
      mockDb.query.chatClears.findFirst.mockResolvedValueOnce(null);
      const getWhereArg = mockMessagesQuery([
        {
          id: 'm1',
          senderId: 'user-2',
          content: 'hello',
          encryptedContent: null,
          encryptedContentForSender: null,
          senderKeyFingerprint: null,
          read: true,
          reaction: null,
          reactedByUserId: null,
          deliveredAt: null,
          timestamp: new Date('2024-01-02T00:00:00Z'),
          totalCount: '1',
        },
      ]);
      const res = makeRes();
      await getMessages(makeReq({ params: { roomId: 'user-1_user-2' } }), res);
      expect(mockDb.query.chatClears.findFirst).toHaveBeenCalled();
      expect(sqlContainsValue(getWhereArg(), 'user-1_user-2')).toBe(true);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([expect.objectContaining({ text: 'hello', sender: 'other' })]),
          totalCount: 1,
        })
      );
    });
  });
});
