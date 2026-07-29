import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import cookie from 'cookie';

import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import mediaRoutes from './routes/media';
import notificationRoutes from './routes/notifications';
import { setOnlineSocketsRef } from './controllers/chat.controller';
import { runMigrations, enablePgTrgm } from '@connext/db';
import { DATABASE_URL, JWT_SECRET, PORT, connectDB, getDb, ALLOWED_ORIGINS } from './lib/constants';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import {
  registerPresenceHandlers,
  registerRoomHandlers,
  registerMessagingHandlers,
  registerTypingHandlers,
  createSocketDeps,
} from './socket';

dotenv.config();

const app = express();
const server = http.createServer(app);

if (process.env.NODE_ENV === 'production') {
  // cross-origin-resource-policy: same-origin blocks credentialed fetches from
  // the split Railway frontend host; allow cross-origin reads for the API.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    })
  );
}
app.use(cookieParser());
app.use(compression());
app.use(pinoHttp({ logger }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/auth', globalLimiter);
app.use('/chat', globalLimiter);
app.use('/media', globalLimiter);

const notificationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many notifications. Slow down.' },
});
app.use('/notifications', notificationLimiter);

const corsOrigin = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => {
  if (process.env.NODE_ENV !== 'production') {
    return callback(null, true);
  }
  if (!origin) return callback(null, true);
  const isRailway = origin.endsWith('.railway.app') || origin.includes('.up.railway.app');
  if (ALLOWED_ORIGINS.includes(origin) || isRailway) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
};

app.use(
  cors({
    origin: corsOrigin,
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
    // Match HTTP CORS so Railway frontend hosts are accepted without env churn.
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
});

const onlineSocketsByUserId = new Map<string, Set<string>>();
const messageTimestamps = new Map<string, number>();

app.use('/auth', authRoutes);
app.use('/chat', chatRoutes);
app.use('/media', mediaRoutes);
app.use('/notifications', notificationRoutes);

setOnlineSocketsRef(onlineSocketsByUserId);

io.use((socket, next) => {
  const token = (socket.handshake.auth?.token as string | undefined)
    || cookie.parse(socket.handshake.headers.cookie || '')['token'];

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

app.use(errorHandler);

const deps = createSocketDeps(onlineSocketsByUserId, messageTimestamps);

io.on('connection', (socket) => {
  registerPresenceHandlers(io, socket, deps);
  registerRoomHandlers(io, socket, deps);
  registerMessagingHandlers(io, socket, deps);
  registerTypingHandlers(io, socket, deps);
});

async function startServer() {
  try {
    if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required in production');
    }

    await getDb().execute(enablePgTrgm);
    logger.info('pg_trgm extension ready');

    await runMigrations(DATABASE_URL);
    logger.info('Database migrations applied');

    await connectDB();
    logger.info('Connected to PostgreSQL');

    server.listen(PORT, '0.0.0.0', () => {
      logger.info({ port: PORT }, 'Server running');
    });
  } catch (error) {
    logger.error({ err: error }, 'Server failed to start');
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
});

void startServer();
