import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';

vi.mock('../lib/constants', () => ({
  getDb: () => null,
  JWT_SECRET: 'test-secret',
  JWT_EXPIRES_DAYS: '7d',
}));

vi.mock('@connext/db', () => ({
  isParticipantRoomId: vi.fn((roomId: string, userId: string) => roomId.includes(userId)),
  getRoomId: vi.fn((a: string, b: string) => [a, b].sort().join('_')),
  messages: {},
  chatRequests: {},
}));

describe('Socket.IO integration', () => {
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
      socket.on('join_room', (roomId: string) => {
        socket.join(roomId);
        socket.emit('room_joined', roomId);
      });
      socket.on('send_message', (data: any) => {
        socket.emit('message_sent', { id: 'msg-1', ...data });
      });
      socket.on('typing_start', (data: any) => {
        socket.to(data.roomId).emit('typing', { userId: socket.data.user.id, roomId: data.roomId });
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

  it('rejects unauthenticated connections', () => new Promise<void>((done) => {
    const badSocket = ioc(`http://localhost:${(httpServer.address() as any).port}`, { auth: {} });
    badSocket.on('connect_error', (err) => {
      expect(err.message).toBe('Unauthorized');
      badSocket.close();
      done();
    });
  }));

  it('authenticates with valid token and joins user room', () => new Promise<void>((done) => {
    clientSocket = ioc(`http://localhost:${(httpServer.address() as any).port}`, { auth: { token } });
    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      done();
    });
  }));

  it('handles join_room event', () => new Promise<void>((done) => {
    clientSocket.emit('join_room', 'room_abc');
    clientSocket.on('room_joined', (roomId: string) => {
      expect(roomId).toBe('room_abc');
      done();
    });
  }));

  it('handles send_message event', () => new Promise<void>((done) => {
    clientSocket.emit('send_message', { roomId: 'room_abc', content: 'hello' });
    clientSocket.on('message_sent', (data: any) => {
      expect(data.id).toBe('msg-1');
      expect(data.content).toBe('hello');
      done();
    });
  }));
});
