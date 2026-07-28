import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

const minute = 60 * 1000;

const keyById = (req: Request) =>
  (req as any).user?.id ?? req.ip ?? 'anonymous';

export const strictAuth = rateLimit({
  windowMs: 1 * minute,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});

export const passwordChange = rateLimit({
  windowMs: 10 * minute,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyById,
  message: { error: 'Too many password attempts. Try again later.' },
});

export const sendVerification = rateLimit({
  windowMs: 10 * minute,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyById,
  message: { error: 'Too many verification requests. Try again later.' },
});

export const verifyEmailLimiter = rateLimit({
  windowMs: 10 * minute,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyById,
  message: { error: 'Too many verification attempts. Try again later.' },
});

export const chatRequest = rateLimit({
  windowMs: 1 * minute,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyById,
  message: { error: 'Too many requests. Slow down.' },
});

export const sendMessage = rateLimit({
  windowMs: 1 * minute,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyById,
  message: { error: 'Too many messages. Slow down.' },
});

export const createInvite = rateLimit({
  windowMs: 10 * minute,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyById,
  message: { error: 'Too many invites. Try again later.' },
});

export const mediaUpload = rateLimit({
  windowMs: 1 * minute,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyById,
  message: { error: 'Too many uploads. Slow down.' },
});

export const standard = rateLimit({
  windowMs: 1 * minute,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
});
