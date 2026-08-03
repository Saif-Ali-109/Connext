import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';

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
  messages: { findFirst: vi.fn() },
};

vi.mock('../lib/constants', () => ({
  getDb: () => mockDb,
  JWT_SECRET: 'test-secret',
  JWT_EXPIRES_DAYS: '7d',
}));

vi.mock('@connext/db', () => ({
  users: {},
  messages: {},
  chatRequests: {},
  getRoomId: vi.fn((a: string, b: string) => [a, b].sort().join('_')),
  isHiddenBy: (hiddenBy: string[] | null | undefined, userId: string) =>
    (hiddenBy ?? []).includes(userId),
  MESSAGE_MAX_LENGTH: 4000,
}));

vi.mock('../lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { registerMessagingHandlers } from '../socket/messaging';

describe('socket send_message', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let clientSocket: ClientSocket;

  const JWT_SECRET = 'test-secret';
  const token = jwt.sign({ id: 'user-1', email: 'a@b.com', name: 'Alice' }, JWT_SECRET);

  beforeAll(() => {
    httpServer = createServer();
    io = new Server(httpServer, { cors: { origin: '*' } });

    io.use((socket, next) => {
      const tok = socket.handshake.auth?.token;
      if (!tok) return next(new Error('Unauthorized'));
      try {
        const decoded = jwt.verify(tok, JWT_SECRET) as any;
        (socket as any).data = { user: decoded };
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });

    io.on('connection', (socket) => {
      socket.join(`user:${socket.data.user.id}`);
      registerMessagingHandlers(io, socket, {
        onlineSocketsByUserId: new Map(),
        messageTimestamps: new Map(),
        emitToContacts: async () => {},
      });
    });

    return new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
  });

  afterAll(() => {
    clientSocket?.close();
    io?.close();
    httpServer?.close();
  });

  afterEach(() => {
    clientSocket?.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    for (const m of ['select', 'from', 'where', 'insert', 'values', 'returning', 'update', 'set', 'delete', 'orderBy', 'limit', 'offset']) {
      mockDb[m].mockReturnValue(mockDb);
    }
    mockDb.query.users.findFirst.mockResolvedValueOnce({
      id: 'user-2',
      email: 'b@b.com',
      name: 'Bob',
      username: 'bob',
    });
    mockDb.query.chatRequests.findFirst.mockResolvedValueOnce({
      id: 'req-1',
      fromUserId: 'user-1',
      toUserId: 'user-2',
      status: 'accepted',
    });
  });

  it('persists and relays senderKeyFingerprint', () => new Promise<void>((done) => {
    let valuesArg: Record<string, unknown> | undefined;
    mockDb.values.mockImplementationOnce((v: Record<string, unknown>) => {
      valuesArg = v;
      return mockDb;
    });
    mockDb.returning.mockResolvedValueOnce([{ id: 'msg-1', senderId: 'user-1' }]);

    clientSocket = ioc(`http://localhost:${(httpServer.address() as any).port}`, {
      auth: { token },
    });

    clientSocket.on('receive_message', (payload: any) => {
      expect(payload.senderKeyFingerprint).toBe('fp-abc');
      expect(payload.encryptedContent).toBe('ciphertext');
    });

    clientSocket.on('connect', () => {
      clientSocket.emit(
        'send_message',
        {
          recipientUserId: 'user-2',
          encryptedContent: 'ciphertext',
          encryptedContentForSender: 'cipher-for-sender',
          senderKeyFingerprint: 'fp-abc',
        },
        (ack: any) => {
          expect(ack.ok).toBe(true);
          expect(valuesArg).toMatchObject({
            senderKeyFingerprint: 'fp-abc',
            encryptedContent: 'ciphertext',
            content: null,
          });
          expect(ack.messageId).toBe('msg-1');
          done();
        }
      );
    });
  }));

  it('persists null senderKeyFingerprint when absent', () => new Promise<void>((done) => {
    let valuesArg: Record<string, unknown> | undefined;
    mockDb.values.mockImplementationOnce((v: Record<string, unknown>) => {
      valuesArg = v;
      return mockDb;
    });
    mockDb.returning.mockResolvedValueOnce([{ id: 'msg-2', senderId: 'user-1' }]);

    clientSocket = ioc(`http://localhost:${(httpServer.address() as any).port}`, {
      auth: { token },
    });

    clientSocket.on('connect', () => {
      clientSocket.emit(
        'send_message',
        { recipientUserId: 'user-2', content: 'plain hello' },
        (ack: any) => {
          expect(ack.ok).toBe(true);
          expect(valuesArg).toMatchObject({
            content: 'plain hello',
            senderKeyFingerprint: null,
          });
           done();
        }
      );
    });
  }));

  it('returns ack error if the authenticated user is hidden by their contact', () => new Promise<void>((done) => {
    mockDb.query.chatRequests.findFirst.mockReset();
    mockDb.query.chatRequests.findFirst.mockResolvedValueOnce({
      id: 'req-1',
      fromUserId: 'user-1',
      toUserId: 'user-2',
      status: 'accepted',
      hiddenBy: ['user-1'],
    });

    clientSocket = ioc(`http://localhost:${(httpServer.address() as any).port}`, {
      auth: { token },
    });

    clientSocket.on('connect', () => {
      clientSocket.emit(
        'send_message',
        { recipientUserId: 'user-2', content: 'hello' },
        (ack: any) => {
          expect(ack.ok).toBe(false);
          expect(ack.error).toBe('No accepted connection between these users');
          done();
        }
      );
    });
  }));
});
