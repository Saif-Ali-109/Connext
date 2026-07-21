import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { eq, and, or, isNull } from 'drizzle-orm';
import {
  users,
  messages,
  chatRequests,
  getRoomId,
  isParticipantRoomId,
} from '@connext/db';

import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import mediaRoutes from './routes/media';
import notificationRoutes from './routes/notifications';
import { setOnlineSocketsRef } from './controllers/chat.controller';
import { JWT_SECRET, PORT, connectDB, ALLOWED_ORIGINS, getDb } from './lib/constants';

dotenv.config();

const app = express();
const server = http.createServer(app);

if (process.env.NODE_ENV === 'production') {
  app.use(helmet());
}
app.use(cookieParser());
app.use(compression());
app.use(morgan('combined'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/auth', limiter);
app.use('/chat', limiter);

app.use(
  cors({
    origin: (origin, callback) => {
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);

app.use(express.json({ limit: '10kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const io = new Server(server, {
  cors: {
    origin:
      process.env.NODE_ENV === 'production'
        ? ALLOWED_ORIGINS
        : (origin, callback) => callback(null, true),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
});

const onlineSocketsByUserId = new Map<string, Set<string>>();

app.use('/auth', authRoutes);
app.use('/chat', chatRoutes);
app.use('/media', mediaRoutes);
app.use('/notifications', notificationRoutes);

setOnlineSocketsRef(onlineSocketsByUserId);

const messageTimestamps = new Map<string, number>();

io.use((socket, next) => {
  let token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    const cookieHeader = socket.handshake.headers.cookie;
    if (cookieHeader) {
      const cookies = Object.fromEntries(
        cookieHeader.split('; ').map((c) => {
          const [k, ...rest] = c.split('=');
          return [k, rest.join('=')];
        })
      );
      token = cookies['token'];
    }
  }

  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err || !decoded || typeof decoded === 'string' || !(decoded as { id?: string }).id) {
      return next(new Error('Authentication error: Invalid token'));
    }
    socket.data.user = decoded;
    next();
  });
});

const getRoomMembers = (roomId: string) =>
  Array.from(io.sockets.adapter.rooms.get(roomId) ?? []);
const getOnlineSocketsForUser = (userId: string) =>
  Array.from(onlineSocketsByUserId.get(userId) ?? []);

io.on('connection', (socket) => {
  const currentUser = socket.data.user as { id: string; email?: string };
  if (!currentUser?.id) {
    return socket.disconnect();
  }

  const currentUserId = String(currentUser.id);
  console.log(`[Socket] CONNECTED: ${currentUserId}`);

  const userSockets = onlineSocketsByUserId.get(currentUserId) ?? new Set<string>();
  userSockets.add(socket.id);
  onlineSocketsByUserId.set(currentUserId, userSockets);
  socket.join(`user:${currentUserId}`);
  io.emit('user_online', { userId: currentUserId });

  socket.on(
    'join_room',
    async (payload: string | { roomId?: string; otherIdentifier?: string }) => {
      const requestedRoomId =
        typeof payload === 'object' && payload !== null ? payload.roomId : undefined;
      const otherIdentifier =
        typeof payload === 'object' && payload !== null
          ? payload.otherIdentifier
          : payload;

      if (requestedRoomId && isParticipantRoomId(requestedRoomId, currentUserId)) {
        socket.join(requestedRoomId);
        socket.emit('room_joined', { roomId: requestedRoomId });
        return;
      }

      if (!otherIdentifier) return;

      try {
        const db = getDb();
        const normalized = otherIdentifier.trim();
        let otherUser =
          (await db.query.users.findFirst({ where: eq(users.id, normalized) })) ||
          (await db.query.users.findFirst({
            where: eq(users.username, normalized.toLowerCase()),
          }));

        if (!otherUser) return;

        const roomId = getRoomId(currentUserId, otherUser.id);
        socket.join(roomId);
        console.log(
          `[Socket] ROOM JOINED: ${currentUserId} -> ${roomId} (${getRoomMembers(roomId).length} members)`
        );
        socket.emit('room_joined', { roomId });
      } catch (err) {
        console.error('[Socket Join Error]', err);
      }
    }
  );

  socket.on(
    'send_message',
    async (
      data: {
        messageId?: string;
        recipientUserId?: string;
        recipientPublicKey?: string;
        content?: string;
        encryptedContent?: string;
        encryptedContentForSender?: string;
      },
      ack?: (payload: {
        ok: boolean;
        error?: string;
        messageId?: string;
        delivered?: boolean;
      }) => void
    ) => {
      try {
        const now = Date.now();
        const last = messageTimestamps.get(socket.id) || 0;
        if (now - last < 500) {
          ack?.({ ok: false, error: 'Too many messages' });
          return;
        }
        messageTimestamps.set(socket.id, now);

        const recipientLookup = data.recipientUserId || data.recipientPublicKey;
        const bodyText = data.content || data.encryptedContent;
        if (!recipientLookup || !bodyText) {
          ack?.({ ok: false, error: 'Missing recipient or content' });
          return;
        }

        const db = getDb();
        const recipient =
          (await db.query.users.findFirst({
            where: eq(users.id, recipientLookup.trim()),
          })) ||
          (await db.query.users.findFirst({
            where: eq(users.username, recipientLookup.trim().toLowerCase()),
          }));

        if (!recipient) {
          ack?.({ ok: false, error: 'Recipient not found' });
          return;
        }

        const request = await db.query.chatRequests.findFirst({
          where: and(
            or(
              and(
                eq(chatRequests.fromUserId, currentUserId),
                eq(chatRequests.toUserId, recipient.id)
              ),
              and(
                eq(chatRequests.fromUserId, recipient.id),
                eq(chatRequests.toUserId, currentUserId)
              )
            ),
            eq(chatRequests.status, 'accepted')
          ),
        });

        if (!request) {
          ack?.({ ok: false, error: 'No accepted connection between these users' });
          return;
        }

        const roomId = getRoomId(currentUserId, recipient.id);

        const relayPayload = {
          id: data.messageId || `relay-${Date.now()}`,
          sender: { id: currentUserId },
          roomId,
          content: data.content || bodyText,
          createdAt: new Date().toISOString(),
        };

        try {
          const [dbMsg] = await db
            .insert(messages)
            .values({
              id: relayPayload.id.startsWith('relay-') ? undefined : relayPayload.id,
              senderId: currentUserId,
              roomId,
              content: data.content || bodyText,
            })
            .returning();
          relayPayload.id = dbMsg.id;
        } catch (err) {
          console.error('[Socket] Failed to persist message:', err);
        }

        const recipientId = recipient.id;
        const recipientSockets = onlineSocketsByUserId.get(recipientId);
        const isRecipientOnline = !!recipientSockets && recipientSockets.size > 0;
        const targetRooms = [
          roomId,
          `user:${recipientId}`,
          `user:${currentUserId}`,
        ];

        let emitter = io.to(targetRooms[0]);
        targetRooms.slice(1).forEach((target) => {
          emitter = emitter.to(target);
        });
        emitter.emit('receive_message', relayPayload);

        // Recipient has a live socket, so the message reaches their device now.
        // Persist deliveredAt so the "delivered" state survives a page reload.
        if (isRecipientOnline && !relayPayload.id.startsWith('relay-')) {
          try {
            await db
              .update(messages)
              .set({ deliveredAt: new Date() })
              .where(eq(messages.id, relayPayload.id));
          } catch (err) {
            console.error('[Socket] Failed to persist deliveredAt:', err);
          }
        }

        socket.emit('message_delivery_status', {
          recipientUserId: recipientId,
          messageId: relayPayload.id,
          delivered: isRecipientOnline,
        });

        ack?.({
          ok: true,
          messageId: relayPayload.id,
          delivered: isRecipientOnline,
        });
      } catch (error) {
        console.error('[Socket Send Error]', error);
        ack?.({
          ok: false,
          error: error instanceof Error ? error.message : 'Socket send failed',
        });
      }
    }
  );

  socket.on('message_delivered', async (data: { roomId: string; messageId: string }) => {
    const { roomId, messageId } = data;
    if (!roomId || !messageId) return;
    socket.to(roomId).emit('message_delivered_relay', { messageId });
    try {
      const db = getDb();
      const [msg] = await db
        .update(messages)
        .set({ deliveredAt: new Date() })
        .where(and(eq(messages.id, messageId), isNull(messages.deliveredAt)))
        .returning();
      const senderId =
        msg?.senderId ??
        (await db.query.messages.findFirst({ where: eq(messages.id, messageId) }))?.senderId;
      if (senderId) {
        io.to(`user:${senderId}`)
          .to(`user:${currentUserId}`)
          .emit('message_delivered_relay', { messageId });
      }
    } catch (e) {
      console.error('Failed to sync message_delivered', e);
    }
  });

  socket.on('message_read', async (data: { roomId: string; messageId: string }) => {
    const { roomId, messageId } = data;
    if (!roomId || !messageId) return;
    socket.to(roomId).emit('message_read_relay', { messageId });
    try {
      const db = getDb();
      const [msg] = await db
        .update(messages)
        .set({ read: true })
        .where(eq(messages.id, messageId))
        .returning();
      if (msg) {
        io.to(`user:${msg.senderId}`)
          .to(`user:${currentUserId}`)
          .emit('message_read_relay', { messageId });
      }
    } catch (e) {
      console.error('Failed to sync message_read', e);
    }
  });

  socket.on('typing_start', ({ roomId }: { roomId: string }) => {
    socket.to(roomId).emit('user_typing', { userId: currentUserId, roomId });
  });

  socket.on('typing_stop', ({ roomId }: { roomId: string }) => {
    socket.to(roomId).emit('user_stopped_typing', { userId: currentUserId, roomId });
  });

  socket.on('disconnect', () => {
    const ownedSockets = onlineSocketsByUserId.get(currentUserId);
    if (ownedSockets) {
      ownedSockets.delete(socket.id);
      if (ownedSockets.size === 0) {
        onlineSocketsByUserId.delete(currentUserId);
        io.emit('user_offline', { userId: currentUserId });
      }
    }
    messageTimestamps.delete(socket.id);
    console.log(`[Socket] DISCONNECTED: ${currentUserId}`);
  });
});

async function startServer() {
  try {
    if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required in production');
    }

    await connectDB();
    console.log('Connected to PostgreSQL');

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Server failed to start:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
});

void startServer();
